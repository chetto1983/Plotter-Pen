import { TWO_PI } from '../../geometry/core.js';
import { ArcBuilder } from '../../geometry/arcBuilder.js';

export class SimulationManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.initState();
  }

  initState() {
    this.state = {
      running: false,
      paused: false,
      commands: [],
      currentIndex: 0,
      progress: 0,  // 0-1 progress within current command
      toolPosition: { x: 0, y: 0 },
      toolDown: false,
      speed: 200,  // units per second (mm/sec)
      trail: [],   // path already drawn
      animationId: null,
      lastTime: 0,
      onComplete: null,
      onUpdate: null,
      lineStart: null,
      lineLength: null,
      arcStart: null,
      arcData: null
    };
    this.renderer.simulation = this.state;
  }

  start(commands, options = {}) {
    if (!this.state) this.initState();

    // Stop any running simulation
    this.stop();

    this.state.commands = commands;
    this.state.currentIndex = 0;
    this.state.progress = 0;
    this.state.toolPosition = { x: 0, y: 0 };
    this.state.toolDown = false;
    this.state.trail = [];
    this.state.running = true;
    this.state.paused = false;
    this.state.speed = options.speed || 100;
    this.state.rapidSpeed = options.rapidSpeed || 1000;
    this.state.onComplete = options.onComplete;
    this.state.onUpdate = options.onUpdate;
    this.state.lastTime = performance.now();
    this.state.lineStart = null;
    this.state.lineLength = null;
    this.state.arcStart = null;
    this.state.arcData = null;

    this.loop();
  }

  loop() {
    if (!this.state.running) return;

    const now = performance.now();
    const deltaTime = (now - this.state.lastTime) / 1000;
    this.state.lastTime = now;

    if (!this.state.paused) {
      this.update(deltaTime);
    }

    this.renderer.requestRender();
    this.state.animationId = requestAnimationFrame(() => this.loop());
  }

  update(deltaTime) {
    const sim = this.state;
    if (sim.currentIndex >= sim.commands.length) {
      this.stop();
      if (sim.onComplete) sim.onComplete();
      return;
    }

    const cmd = sim.commands[sim.currentIndex];

    // Realistic Speed Logic:
    // If tool is DOWN, use slider speed (Feed Rate)
    // If tool is UP, use Rapid Speed
    const currentSpeed = sim.toolDown ? sim.speed : sim.rapidSpeed;

    const moveDistance = currentSpeed * deltaTime;

    // Handle different command types
    if (cmd.type === 'Z_up') {
      sim.toolDown = false;
      sim.currentIndex++;
      sim.progress = 0;
    } else if (cmd.type === 'Z_down') {
      sim.toolDown = true;
      sim.currentIndex++;
      sim.progress = 0;
    } else if (cmd.type === 'waypoint' || cmd.type === 'line' || cmd.type === 'arc') {
      // Parse target position from command
      const target = this.parseCommandTarget(cmd);
      if (!target) {
        sim.currentIndex++;
        sim.progress = 0;
        return;
      }

      // Calculate path
      if (cmd.type === 'arc' && target.auxX !== undefined) {
        // Arc movement - interpolate along arc
        this.updateArcMovement(sim, target, moveDistance);
      } else {
        // Linear movement
        this.updateLinearMovement(sim, target, moveDistance);
      }
    } else {
      // Unknown command, skip
      sim.currentIndex++;
      sim.progress = 0;
    }

    if (sim.onUpdate) {
      sim.onUpdate({
        index: sim.currentIndex,
        total: sim.commands.length,
        position: { ...sim.toolPosition },
        toolDown: sim.toolDown
      });
    }
  }

  /**
   * Update linear movement
   */
  updateLinearMovement(sim, target, moveDistance) {
    // Store start position on first frame of this movement
    if (!sim.lineStart) {
      sim.lineStart = { x: sim.toolPosition.x, y: sim.toolPosition.y };
      sim.lineLength = null;
    }

    const startX = sim.lineStart.x;
    const startY = sim.lineStart.y;
    const dx = target.x - startX;
    const dy = target.y - startY;

    // Calculate total distance once and cache it
    if (!sim.lineLength) {
      sim.lineLength = Math.sqrt(dx * dx + dy * dy);
    }

    const totalDist = sim.lineLength;

    if (totalDist < 0.1) {
      // Arrived at target
      sim.toolPosition.x = target.x;
      sim.toolPosition.y = target.y;
      sim.currentIndex++;
      sim.progress = 0;
      sim.lineStart = null;
      sim.lineLength = null;
      return;
    }

    const step = Math.min(moveDistance / totalDist, 1 - sim.progress);
    const oldPos = { ...sim.toolPosition };

    sim.progress += step;

    // Interpolate from stored start position
    sim.toolPosition.x = startX + dx * sim.progress;
    sim.toolPosition.y = startY + dy * sim.progress;

    // Add to trail if tool is down
    if (sim.toolDown) {
      sim.trail.push({
        type: 'line',
        x1: oldPos.x,
        y1: oldPos.y,
        x2: sim.toolPosition.x,
        y2: sim.toolPosition.y
      });
    }

    if (sim.progress >= 1) {
      sim.toolPosition.x = target.x;
      sim.toolPosition.y = target.y;
      sim.currentIndex++;
      sim.progress = 0;
      sim.lineStart = null;
      sim.lineLength = null;
    }
  }

  /**
   * Update arc movement
   */
  updateArcMovement(sim, target, moveDistance) {
    // For arc, we need start, end, and aux point
    // Use arcStart stored when arc command begins, not current position
    if (!sim.arcStart) {
      // First frame of this arc - store the starting position
      sim.arcStart = { x: sim.toolPosition.x, y: sim.toolPosition.y };
      sim.arcData = null;  // Will be calculated below
    }

    const startX = sim.arcStart.x;
    const startY = sim.arcStart.y;
    const endX = target.x;
    const endY = target.y;
    const auxX = target.auxX;
    const auxY = target.auxY;

    // Calculate arc data once and cache it
    if (!sim.arcData) {
      const circle = this.circleFromThreePoints(
        { x: startX, y: startY },
        { x: auxX, y: auxY },
        { x: endX, y: endY }
      );

      if (!circle) {
        // Fallback to linear
        sim.arcStart = null;
        this.updateLinearMovement(sim, target, moveDistance);
        return;
      }

      const startAngle = Math.atan2(startY - circle.cy, startX - circle.cx);
      const auxAngle = Math.atan2(auxY - circle.cy, auxX - circle.cx);
      const endAngle = Math.atan2(endY - circle.cy, endX - circle.cx);
      const sweepAngle = this.calculateSweepThroughPoint(startAngle, auxAngle, endAngle);

      sim.arcData = {
        circle,
        startAngle,
        sweepAngle,
        arcLength: Math.abs(sweepAngle) * circle.r
      };
    }

    const { circle, startAngle, sweepAngle, arcLength } = sim.arcData;

    if (arcLength < 0.1) {
      sim.toolPosition.x = endX;
      sim.toolPosition.y = endY;
      sim.currentIndex++;
      sim.progress = 0;
      sim.arcStart = null;
      sim.arcData = null;
      return;
    }

    const step = Math.min(moveDistance / arcLength, 1 - sim.progress);
    const oldPos = { ...sim.toolPosition };

    sim.progress += step;
    const currentAngle = startAngle + sweepAngle * sim.progress;
    sim.toolPosition.x = circle.cx + circle.r * Math.cos(currentAngle);
    sim.toolPosition.y = circle.cy + circle.r * Math.sin(currentAngle);

    // Add to trail if tool is down
    if (sim.toolDown) {
      sim.trail.push({
        type: 'line',
        x1: oldPos.x,
        y1: oldPos.y,
        x2: sim.toolPosition.x,
        y2: sim.toolPosition.y
      });
    }

    if (sim.progress >= 1) {
      sim.toolPosition.x = endX;
      sim.toolPosition.y = endY;
      sim.currentIndex++;
      sim.progress = 0;
      sim.arcStart = null;
      sim.arcData = null;
    }
  }

  /**
   * Calculate sweep angle that passes through aux point
   * Delegates to ArcBuilder's canonical implementation
   */
  calculateSweepThroughPoint(startAngle, auxAngle, endAngle) {
    return ArcBuilder.calculateSweepThroughPoint(startAngle, auxAngle, endAngle);
  }

  /**
   * Calculate circle from 3 points
   * Delegates to ArcBuilder's canonical implementation
   */
  circleFromThreePoints(p1, p2, p3) {
    return ArcBuilder.circleFromThreePoints(p1, p2, p3);
  }

  /**
   * Parse command to get target position
   */
  parseCommandTarget(cmd) {
    const match = cmd.command.match(/X\s*([\d.-]+),?\s*Y\s*([\d.-]+)/);
    if (!match) return null;

    const result = {
      x: parseFloat(match[1]),
      y: parseFloat(match[2])
    };

    // Check for aux point (I, J) for arcs
    const auxMatch = cmd.command.match(/I\s*([\d.-]+),?\s*J\s*([\d.-]+)/);
    if (auxMatch) {
      result.auxX = parseFloat(auxMatch[1]);
      result.auxY = parseFloat(auxMatch[2]);
    }

    return result;
  }

  stop() {
    if (this.state) {
      this.state.running = false;
      if (this.state.animationId) {
        cancelAnimationFrame(this.state.animationId);
        this.state.animationId = null;
      }
    }
    this.renderer.requestRender();
  }

  togglePause() {
    if (this.state) {
      this.state.paused = !this.state.paused;
      if (!this.state.paused) {
        this.state.lastTime = performance.now();
      }
    }
  }

  setSpeed(speed) {
    if (this.state) {
      this.state.speed = speed;
    }
  }

  setRapidSpeed(speed) {
    if (this.state) {
      this.state.rapidSpeed = speed;
    }
  }

  /**
   * Draw simulation overlay
   */
  draw(ctx, scale) {
    if (!this.state || !this.state.running) return;

    const sim = this.state;

    // Draw completed trail (green)
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2 / scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const segment of sim.trail) {
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
    }

    // Draw tool position
    const toolSize = 8 / scale;
    ctx.fillStyle = sim.toolDown ? '#ff0000' : '#ffff00';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / scale;

    ctx.beginPath();
    ctx.arc(sim.toolPosition.x, sim.toolPosition.y, toolSize, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    // Draw tool direction indicator
    if (sim.toolDown) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(sim.toolPosition.x, sim.toolPosition.y, toolSize / 2, 0, TWO_PI);
      ctx.fill();
    }
  }
}

export default SimulationManager;
