# Siemens S7-1500 OPC UA simulator for Plotter-Pen (standalone, not part of docker compose)
#   docker build -t plotter-pen-s7sim tools/s7sim
#   docker run -d --name plotter-pen-s7sim -p 4840:4840 plotter-pen-s7sim
FROM python:3.14-slim

RUN pip install --no-cache-dir asyncua==2.0.1

WORKDIR /sim
COPY s7sim.py .

EXPOSE 4840
ENTRYPOINT ["python", "-u", "s7sim.py"]
CMD ["--port", "4840"]
