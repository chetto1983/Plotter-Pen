#!/usr/bin/env python3
"""
Siemens S7-1500 OPC UA simulator for Plotter-Pen (no security, no certificates).

Emulates the "Comm" server interface of the PLC:
  * chunked transfer handshake (PointArr / TriggerWrite / Trigger_read_done / End_Of_File)
  * program execution after End_Of_File: J / L / A / WAIT commands move Pos X/Y/Z
  * the S7 quirk that matters for the Go client: a Write whose DataValue carries a
    StatusCode or timestamps is rejected with Bad_WriteNotSupported (0x80730000)

Run locally:
    pip install asyncua
    python tools/s7sim/s7sim.py                   # opc.tcp://127.0.0.1:4840
    python tools/s7sim/s7sim.py --speed-factor 5  # run programs 5x faster

Run as a container (standalone, not part of docker compose):
    docker build -t plotter-pen-s7sim tools/s7sim
    docker run -d --name plotter-pen-s7sim -p 4840:4840 plotter-pen-s7sim
    # from the plotter-pen container the endpoint is opc.tcp://host.docker.internal:4840

Node IDs match the production PLC config (ns=4):
    PointArr          ns=4;i=12   STRING[20]
    TriggerWrite      ns=4;i=43   BOOL
    Trigger_read_done ns=4;i=54   BOOL
    End_Of_File       ns=4;i=65   BOOL
    Pos.X/Y/Z         ns=4;i=79/80/81  REAL
"""

import argparse
import asyncio
import logging
import math
import re

from asyncua import Server, ua
from asyncua.server.internal_session import InternalSession

log = logging.getLogger("s7sim")

COMM_NS_INDEX = 4  # the real PLC exposes the Comm interface at ns=4
CHUNK_SIZE = 20
TRIGGER_NODEID = ua.NodeId(43, COMM_NS_INDEX)
EOF_NODEID = ua.NodeId(65, COMM_NS_INDEX)
MOTION_TICK_S = 0.05  # position update period while executing
JUMP_SPEED = 200.0  # rapid move speed (mm/s) used for J when V is lower

# Client writes to TriggerWrite / End_Of_File, queued in write order so no edge is ever missed
plc_events: asyncio.Queue[tuple[str, bool]] = asyncio.Queue()

# Command format produced by pkg/plc/generator.go
MOVE_RE = re.compile(
    r"^(?P<op>[JLA])\s+X\s*(?P<x>-?[\d.]+),\s*Y\s*(?P<y>-?[\d.]+),\s*Z\s*(?P<z>-?[\d.]+)"
    r"(?:,\s*I\s*(?P<i>-?[\d.]+),\s*J\s*(?P<j>-?[\d.]+))?,\s*V\s*(?P<v>-?[\d.]+)"
)
WAIT_RE = re.compile(r"^WAIT\s+(?P<ms>\d+)")


def s7_rejects(dv: ua.DataValue) -> str | None:
    """Return the field name that would make an S7-1500 refuse this write, or None."""
    if dv.SourceTimestamp is not None:
        return "SourceTimestamp"
    if dv.ServerTimestamp is not None:
        return "ServerTimestamp"
    if getattr(dv, "Encoding", 0) & 0x02:
        return "StatusCode"
    return None


def describe(dv: ua.DataValue) -> str:
    v = dv.Value.Value if dv.Value is not None else None
    if isinstance(v, list):
        filled = [s for s in v if s]
        first = f" first={filled[0]!r}" if filled else ""
        return f"array[{len(v)}] ({len(filled)} non-empty){first}"
    return repr(v)


def install_s7_write_rules() -> None:
    """Wrap client-session Writes so they behave like a Siemens S7-1500 (server-internal writes are untouched)."""
    orig_write = InternalSession.write

    async def s7_write(self: InternalSession, params: ua.WriteParameters):
        if not self.external:
            return await orig_write(self, params)
        results: list[ua.StatusCode | None] = [None] * len(params.NodesToWrite)
        passthrough = ua.WriteParameters()
        passthrough_idx: list[int] = []
        for i, wv in enumerate(params.NodesToWrite):
            why = s7_rejects(wv.Value) if wv.AttributeId == ua.AttributeIds.Value else None
            if why:
                log.warning(
                    "REJECT write %s: DataValue carries %s (mask=0x%02x) -> Bad_WriteNotSupported",
                    wv.NodeId.to_string(), why, getattr(wv.Value, "Encoding", 0),
                )
                results[i] = ua.StatusCode(ua.StatusCodes.BadWriteNotSupported)
            else:
                passthrough.NodesToWrite.append(wv)
                passthrough_idx.append(i)
        if passthrough_idx:
            statuses = await orig_write(self, passthrough)
            for i, st in zip(passthrough_idx, statuses):
                results[i] = st
                wv = params.NodesToWrite[i]
                log.debug("write %s = %s -> %s", wv.NodeId.to_string(), describe(wv.Value), st.name)
                if st.is_good() and wv.NodeId in (TRIGGER_NODEID, EOF_NODEID):
                    kind = "trigger" if wv.NodeId == TRIGGER_NODEID else "eof"
                    plc_events.put_nowait((kind, bool(wv.Value.Value.Value)))
        return results

    InternalSession.write = s7_write


class Machine:
    """Pen plotter axes, exposed as Pos X/Y/Z."""

    def __init__(self, server: Server, pos_nodes: list, speed_factor: float):
        self.server = server
        self.pos_nodes = pos_nodes
        self.speed_factor = speed_factor
        self.xyz = [0.0, 0.0, 0.0]

    async def publish(self) -> None:
        for node, value in zip(self.pos_nodes, self.xyz):
            await self.server.write_attribute_value(node.nodeid, ua.DataValue(ua.Variant(value, ua.VariantType.Float)))

    async def move_to(self, target: list[float], speed: float) -> None:
        start = list(self.xyz)
        dist = math.dist(start, target)
        speed = max(speed, 1.0) * self.speed_factor
        steps = max(1, math.ceil(dist / speed / MOTION_TICK_S))
        for n in range(1, steps + 1):
            t = n / steps
            self.xyz = [a + (b - a) * t for a, b in zip(start, target)]
            await self.publish()
            await asyncio.sleep(MOTION_TICK_S)

    async def run_program(self, program: list[str]) -> None:
        log.info("PLC: executing program (%d commands)", len(program))
        for n, cmd in enumerate(program, 1):
            if m := MOVE_RE.match(cmd):
                x, y, z, v = (float(m[k]) for k in ("x", "y", "z", "v"))
                if m["op"] == "A" and m["i"] is not None:
                    # generator emits the arc midpoint as I/J: go through it, then to the end point
                    await self.move_to([float(m["i"]), float(m["j"]), z], v)
                await self.move_to([x, y, z], max(v, JUMP_SPEED) if m["op"] == "J" else v)
            elif m := WAIT_RE.match(cmd):
                await asyncio.sleep(int(m["ms"]) / 1000 / self.speed_factor)
            else:
                log.warning("PLC: line %d not understood, skipped: %r", n, cmd)
        log.info("PLC: program finished at X=%.3f Y=%.3f Z=%.3f", *self.xyz)


async def plc_program(server: Server, nodes: dict, machine: Machine) -> None:
    """The PLC cycle: ack every TriggerWrite rising edge, run the program on End_Of_File."""
    trigger, read_done, eof, point_arr = nodes["trigger"], nodes["read_done"], nodes["eof"], nodes["point_arr"]
    assert trigger.nodeid == TRIGGER_NODEID and eof.nodeid == EOF_NODEID

    async def set_bool(node, value: bool):
        await server.write_attribute_value(node.nodeid, ua.DataValue(ua.Variant(value, ua.VariantType.Boolean)))

    program: list[str] = []
    chunks = 0
    prev = {"trigger": False, "eof": False}
    running: asyncio.Task | None = None
    while True:
        kind, value = await plc_events.get()
        rising = value and not prev[kind]
        prev[kind] = value

        if kind == "trigger" and rising:
            data = await point_arr.read_value() or []
            got = [s for s in data if s]
            program.extend(got)
            chunks += 1
            log.info("PLC: chunk #%d received (%d lines) -> Trigger_read_done=TRUE", chunks, len(got))
            await set_bool(read_done, True)
        elif kind == "eof" and rising:
            log.info("PLC: End_Of_File=TRUE -> transfer complete: %d chunks, %d lines", chunks, len(program))
            if running and not running.done():
                running.cancel()
            running = asyncio.create_task(machine.run_program(program))
            program, chunks = [], 0
        elif kind == "eof" and not value:
            # client reset End_Of_File: a new transfer is starting
            if running and not running.done():
                log.info("PLC: new transfer started, aborting running program")
                running.cancel()
            program, chunks = [], 0


async def build_address_space(server: Server) -> dict:
    # Default server has ns 0 and 1; register until the Comm interface lands on ns=4 like the PLC
    uris = ["http://www.siemens.com/simatic-s7-opcua", "http://s7sim/filler", "http://Comm"]
    idx = None
    for uri in uris:
        idx = await server.register_namespace(uri)
    assert idx == COMM_NS_INDEX, f"Comm namespace landed on ns={idx}, expected {COMM_NS_INDEX}"

    def nid(i: int) -> ua.NodeId:
        return ua.NodeId(i, idx)

    comm = await server.nodes.objects.add_object(nid(1), "Comm")
    point_arr = await comm.add_variable(nid(12), "PointArr", [""] * CHUNK_SIZE, ua.VariantType.String)
    trigger = await comm.add_variable(nid(43), "TriggerWrite", False, ua.VariantType.Boolean)
    read_done = await comm.add_variable(nid(54), "Trigger_read_done", False, ua.VariantType.Boolean)
    eof = await comm.add_variable(nid(65), "End_Of_File", False, ua.VariantType.Boolean)
    pos_obj = await comm.add_object(nid(78), "Pos")
    pos = [
        await pos_obj.add_variable(nid(79 + i), name, 0.0, ua.VariantType.Float) for i, name in enumerate("XYZ")
    ]
    for node in (point_arr, trigger, read_done, eof, *pos):
        await node.set_writable()
    return {"point_arr": point_arr, "trigger": trigger, "read_done": read_done, "eof": eof, "pos": pos}


async def main(port: int, speed_factor: float) -> None:
    server = Server()
    await server.init()
    server.set_endpoint(f"opc.tcp://0.0.0.0:{port}/")
    server.set_server_name("S7-1500 Simulator (Plotter-Pen)")
    server.set_security_policy([ua.SecurityPolicyType.NoSecurity])

    nodes = await build_address_space(server)
    install_s7_write_rules()
    machine = Machine(server, nodes["pos"], speed_factor)

    async with server:
        log.info("S7-1500 simulator listening on opc.tcp://0.0.0.0:%d  (security: None, auth: anonymous)", port)
        log.info("Comm nodes: PointArr ns=4;i=12  TriggerWrite ns=4;i=43  Trigger_read_done ns=4;i=54  End_Of_File ns=4;i=65")
        await plc_program(server, nodes, machine)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=4840)
    ap.add_argument("--speed-factor", type=float, default=1.0, help="program execution speed multiplier (V is mm/s)")
    ap.add_argument("-v", "--verbose", action="store_true", help="log every client write")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    log.setLevel(logging.DEBUG if args.verbose else logging.INFO)
    logging.getLogger("asyncua").setLevel(logging.WARNING)
    try:
        asyncio.run(main(args.port, args.speed_factor))
    except KeyboardInterrupt:
        pass
