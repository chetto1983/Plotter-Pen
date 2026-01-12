import {
    BRANDING_CSS,
    GCodeRenderer,
    injectBranding,
    THREE
} from '../lib/polar3d-viewer.bundle.mjs';

const EPSILON = 1e-6;

export class Polar3DViewerAdapter {
    constructor(canvas, options = {}) {
        if (!canvas) {
            throw new Error('Polar3DViewerAdapter requires a canvas element.');
        }

        this.canvas = canvas;
        this.container = canvas.parentElement || canvas;
        this.options = {
            renderTubes: false,
            lineWidth: 2,
            colorScheme: 'height',
            showTravel: false,
            ...options
        };

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });

        this.gcodeRenderer = null;
        this.gcodeGroup = null;
        this.resizeObserver = null;
        this.controls = null;

        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setClearColor(0x000000, 0);

        this.addLights();
        this.injectBranding();
        this.observeResize();
        this.initControls();
        this.resize();
    }

    addLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(200, 200, 300);
        this.scene.add(ambient, directional);
    }

    injectBranding() {
        if (!this.container) {
            return;
        }

        const styleId = 'polar3d-branding-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = BRANDING_CSS;
            document.head.appendChild(style);
        }

        injectBranding(this.container);
    }

    observeResize() {
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.container);
        } else {
            this.handleWindowResize = () => this.resize();
            window.addEventListener('resize', this.handleWindowResize);
        }
    }

    getCanvasSize() {
        const rect = this.canvas.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }

    setParsedData(parsed) {
        if (!parsed || !Array.isArray(parsed.layers)) {
            this.clearScene();
            this.renderFrame();
            return;
        }

        const boundingBox = this.toBoundingBox(parsed.boundingBox);
        this.clearScene();

        if (this.gcodeRenderer) {
            this.gcodeRenderer.dispose();
        }

        const { width, height } = this.getCanvasSize();
        this.gcodeRenderer = new GCodeRenderer({
            ...this.options,
            canvasWidth: Math.max(1, width),
            canvasHeight: Math.max(1, height)
        });

        const renderedLayers = this.gcodeRenderer.render(parsed.layers, boundingBox);
        this.gcodeRenderer.layers = renderedLayers;

        this.gcodeGroup = new THREE.Group();
        renderedLayers.forEach(layer => {
            if (layer?.object) {
                this.gcodeGroup.add(layer.object);
            }
        });

        this.gcodeGroup.rotation.x = -Math.PI / 2;
        this.scene.add(this.gcodeGroup);

        this.fitCameraToBounds(boundingBox);
        this.renderFrame();
    }

    toBoundingBox(bounds) {
        const min = bounds?.min ?? {};
        const max = bounds?.max ?? {};
        return {
            min: new THREE.Vector3(
                Number.isFinite(min.x) ? min.x : 0,
                Number.isFinite(min.y) ? min.y : 0,
                Number.isFinite(min.z) ? min.z : 0
            ),
            max: new THREE.Vector3(
                Number.isFinite(max.x) ? max.x : 0,
                Number.isFinite(max.y) ? max.y : 0,
                Number.isFinite(max.z) ? max.z : 0
            )
        };
    }

    fitCameraToBounds(bounds) {
        const sizeX = Math.max(1, bounds.max.x - bounds.min.x);
        const sizeY = Math.max(1, bounds.max.y - bounds.min.y);
        const sizeZ = Math.max(1, bounds.max.z - bounds.min.z);
        const maxDim = Math.max(sizeX, sizeY, sizeZ);

        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const baseDistance = maxDim / (2 * Math.tan(fov / 2));
        const distance = baseDistance * 1.6;

        this.camera.position.set(distance, distance, distance);
        this.camera.near = Math.max(0.1, distance / 100);
        this.camera.far = distance * 10;
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
        this.syncControlsToCamera();
    }

    clearScene() {
        if (this.gcodeGroup) {
            this.gcodeGroup.traverse((child) => {
                if (child.geometry && typeof child.geometry.dispose === 'function') {
                    child.geometry.dispose();
                }
            });
            this.scene.remove(this.gcodeGroup);
            this.gcodeGroup = null;
        }
    }

    resize() {
        const { width, height } = this.getCanvasSize();
        if (width < 2 || height < 2) {
            return;
        }

        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        if (this.gcodeRenderer) {
            this.gcodeRenderer.updateResolution(width, height);
        }

        this.renderFrame();
    }

    renderFrame() {
        if (!this.renderer || !this.scene || !this.camera) {
            return;
        }

        this.renderer.render(this.scene, this.camera);
    }

    initControls() {
        this.controls = {
            enabled: true,
            isDragging: false,
            lastX: 0,
            lastY: 0,
            theta: Math.PI / 4,
            phi: Math.PI / 4,
            radius: 1000,
            minRadius: 10,
            maxRadius: 100000
        };

        this.canvas.style.touchAction = 'none';

        this.handlePointerDown = (event) => {
            if (!this.controls.enabled || event.button !== 0) {
                return;
            }

            this.controls.isDragging = true;
            this.controls.lastX = event.clientX;
            this.controls.lastY = event.clientY;
            this.canvas.setPointerCapture?.(event.pointerId);
        };

        this.handlePointerMove = (event) => {
            if (!this.controls.enabled || !this.controls.isDragging) {
                return;
            }

            const dx = event.clientX - this.controls.lastX;
            const dy = event.clientY - this.controls.lastY;

            this.controls.lastX = event.clientX;
            this.controls.lastY = event.clientY;

            const speed = 0.005;
            this.controls.theta -= dx * speed;
            this.controls.phi += dy * speed;

            const minPhi = 0.2;
            const maxPhi = Math.PI - 0.2;
            this.controls.phi = Math.min(maxPhi, Math.max(minPhi, this.controls.phi));

            this.updateCameraFromControls();
        };

        this.handlePointerUp = () => {
            if (!this.controls) {
                return;
            }
            this.controls.isDragging = false;
        };

        this.handleWheel = (event) => {
            if (!this.controls.enabled) {
                return;
            }

            event.preventDefault();
            const zoomFactor = event.deltaY > 0 ? 1.08 : 0.92;
            const nextRadius = this.controls.radius * zoomFactor;
            this.controls.radius = Math.min(this.controls.maxRadius, Math.max(this.controls.minRadius, nextRadius));
            this.updateCameraFromControls();
        };

        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    syncControlsToCamera() {
        if (!this.controls || !this.camera) {
            return;
        }

        const pos = this.camera.position;
        const radius = Math.max(EPSILON, pos.length());
        this.controls.radius = radius;
        this.controls.theta = Math.atan2(pos.y, pos.x);
        this.controls.phi = Math.acos(pos.z / radius);
        this.controls.minRadius = Math.max(10, radius * 0.15);
        this.controls.maxRadius = Math.max(this.controls.minRadius * 2, radius * 6);
    }

    updateCameraFromControls() {
        if (!this.controls || !this.camera) {
            return;
        }

        const { radius, theta, phi } = this.controls;
        const x = radius * Math.cos(theta) * Math.sin(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(phi);

        this.camera.position.set(x, y, z);
        this.camera.lookAt(0, 0, 0);
        this.camera.updateProjectionMatrix();
        this.renderFrame();
    }

    dispose() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if (this.handleWindowResize) {
            window.removeEventListener('resize', this.handleWindowResize);
        }

        if (this.gcodeRenderer) {
            this.gcodeRenderer.dispose();
        }

        this.clearScene();

        if (this.renderer) {
            this.renderer.dispose();
        }

        if (this.handlePointerDown) {
            this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        }
        if (this.handlePointerMove) {
            window.removeEventListener('pointermove', this.handlePointerMove);
        }
        if (this.handlePointerUp) {
            window.removeEventListener('pointerup', this.handlePointerUp);
        }
        if (this.handleWheel) {
            this.canvas.removeEventListener('wheel', this.handleWheel);
        }
    }
}
