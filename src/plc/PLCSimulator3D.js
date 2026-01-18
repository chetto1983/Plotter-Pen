/**
 * PLCSimulator3D - Three.js 3D visualization for PLC command execution
 * Features: Tool mesh, trail rendering, STL loader, orbit controls
 * Uses polar3d-viewer bundle (includes Three.js + branding requirements)
 */
import { THREE, BRANDING_CSS, injectBranding } from '../lib/polar3d-viewer.bundle.mjs';
import { ViewCubeHelper } from './ViewCubeHelper.js';
import { PrimitiveRenderer3D } from './PrimitiveRenderer3D.js';

export class PLCSimulator3D {
    constructor(canvas) {
        if (!canvas) {
            throw new Error('PLCSimulator3D requires a canvas element');
        }

        this.canvas = canvas;
        this.container = canvas.parentElement || canvas;

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        this.camera.position.set(500, 500, 500);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);

        // Trail data - improved colors for visibility on dark background
        this.trailSegments = [];
        this.rapidMaterial = new THREE.LineBasicMaterial({ color: 0x00ffaa, linewidth: 2 }); // Cyan-green
        this.cutMaterial = new THREE.LineBasicMaterial({ color: 0xff6644, linewidth: 2 });   // Orange-red
        this.liveMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });  // Yellow (live)
        this.trailGroup = new THREE.Group();
        this.scene.add(this.trailGroup);

        // Primitives renderer (CAD shapes on work surface)
        this.primitiveRenderer = new PrimitiveRenderer3D(THREE, this.scene);

        // Live trail line (real-time during animation)
        this.liveTrailLine = null;

        // Tool mesh
        this.toolMesh = this.createDefaultTool(6, 30);
        this.scene.add(this.toolMesh);

        // Grid references (will be created in fitToView)
        this.gridHelper = null;
        this.gridOutline = null;

        // Initial work surface grid (centered at origin)
        this.addWorkSurface(600, 600);
        this.addLights();
        this.addAxesHelper();
        this.addNavigationCube();
        this.injectBranding();
        this.initControls();
        this.observeResize();
        this.resize();
    }

    /**
     * Add XYZ axes helper to scene
     */
    addAxesHelper() {
        this.axesHelper = new THREE.AxesHelper(100);
        this.axesHelper.position.set(0, 0, 0);
        this.scene.add(this.axesHelper);
    }

    /**
     * Create navigation cube HUD
     */
    addNavigationCube() {
        this.viewCubeHelper = new ViewCubeHelper(THREE);
    }

    injectBranding() {
        if (!this.container) return;

        const styleId = 'polar3d-branding-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = BRANDING_CSS;
            document.head.appendChild(style);
        }

        injectBranding(this.container);
    }

    addLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        const directional = new THREE.DirectionalLight(0xffffff, 0.8);
        directional.position.set(300, 300, 500);
        this.scene.add(ambient, directional);
    }

    addWorkSurface(width, height) {
        // Grid helper (centered at origin initially)
        const gridSize = Math.max(width, height);
        const divisions = 20;
        this.gridHelper = new THREE.GridHelper(gridSize, divisions, 0x444466, 0x333355);
        this.gridHelper.rotation.x = Math.PI / 2; // XY plane
        this.scene.add(this.gridHelper);

        // Work area outline
        const geometry = new THREE.BufferGeometry();
        const hw = width / 2, hh = height / 2;
        const vertices = new Float32Array([
            -hw, -hh, 0,  hw, -hh, 0,
            hw, -hh, 0,   hw, hh, 0,
            hw, hh, 0,    -hw, hh, 0,
            -hw, hh, 0,   -hw, -hh, 0
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        this.gridOutline = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x6666ff }));
        this.scene.add(this.gridOutline);
    }

    createDefaultTool(diameter, height) {
        const group = new THREE.Group();
        const radius = diameter / 2;

        // Cylinder body
        const bodyGeom = new THREE.CylinderGeometry(radius, radius, height * 0.7, 32);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.z = height * 0.35;
        body.rotation.x = Math.PI / 2;
        group.add(body);

        // Cone tip
        const tipGeom = new THREE.ConeGeometry(radius, height * 0.3, 32);
        const tipMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, shininess: 100 });
        const tip = new THREE.Mesh(tipGeom, tipMat);
        tip.rotation.x = -Math.PI / 2;
        group.add(tip);

        // Holder cylinder
        const holderGeom = new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, height * 0.2, 32);
        const holderMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const holder = new THREE.Mesh(holderGeom, holderMat);
        holder.position.z = height * 0.8;
        holder.rotation.x = Math.PI / 2;
        group.add(holder);

        return group;
    }

    /**
     * Load custom STL tool model
     * @param {File|string} source - File object or URL
     */
    async loadToolSTL(source) {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        const loader = new STLLoader();

        let geometry;
        if (source instanceof File) {
            const buffer = await source.arrayBuffer();
            geometry = loader.parse(buffer);
        } else {
            geometry = await loader.loadAsync(source);
        }

        const material = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 });
        this.scene.remove(this.toolMesh);
        this.toolMesh = new THREE.Mesh(geometry, material);
        this.toolMesh.rotation.x = -Math.PI / 2; // STL Z-up to Three.js Y-up
        this.scene.add(this.toolMesh);
        this.renderFrame();
    }

    /**
     * Set tool position
     */
    setToolPosition(x, y, z) {
        this.toolMesh.position.set(x, y, z);
        this.renderFrame();
    }

    /**
     * Add trail segment
     * @param {Object} from - {x, y, z}
     * @param {Object} to - {x, y, z}
     * @param {boolean} isRapid - true for rapid (green), false for cut (red)
     */
    addTrailSegment(from, to, isRapid = false) {
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            from.x, from.y, from.z,
            to.x, to.y, to.z
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        const material = isRapid ? this.rapidMaterial : this.cutMaterial;
        const line = new THREE.Line(geometry, material);
        this.trailGroup.add(line);
        this.trailSegments.push(line);
        this.renderFrame();
    }

    /**
     * Add arc trail segment (curved line)
     * @param {Object} from - start point {x, y, z}
     * @param {Object} to - end point {x, y, z}
     * @param {Object} center - arc center {cx, cy}
     * @param {number} radius - arc radius
     * @param {number} startAngle - start angle in radians
     * @param {number} endAngle - end angle in radians
     * @param {boolean} clockwise - true for CW, false for CCW
     */
    addArcTrailSegment(from, to, center, radius, startAngle, endAngle, clockwise) {
        // Calculate sweep angle
        let sweep;
        if (clockwise) {
            sweep = startAngle - endAngle;
            if (sweep < 0) sweep += 2 * Math.PI;
        } else {
            sweep = endAngle - startAngle;
            if (sweep < 0) sweep += 2 * Math.PI;
        }

        // Number of segments based on arc length (more segments for longer arcs)
        const arcLength = radius * sweep;
        const segments = Math.max(8, Math.min(64, Math.ceil(arcLength / 2)));

        // Generate points along the arc
        const vertices = new Float32Array((segments + 1) * 3);
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            let angle;
            if (clockwise) {
                angle = startAngle - sweep * t;
            } else {
                angle = startAngle + sweep * t;
            }

            const x = center.cx + radius * Math.cos(angle);
            const y = center.cy + radius * Math.sin(angle);
            // Z interpolates linearly
            const z = from.z + (to.z - from.z) * t;

            vertices[i * 3] = x;
            vertices[i * 3 + 1] = y;
            vertices[i * 3 + 2] = z;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

        // Arcs are always cut moves (red)
        const line = new THREE.Line(geometry, this.cutMaterial);
        this.trailGroup.add(line);
        this.trailSegments.push(line);
        this.renderFrame();
    }

    /**
     * Clear all trail segments
     */
    clearTrail() {
        for (const segment of this.trailSegments) {
            segment.geometry.dispose();
            this.trailGroup.remove(segment);
        }
        this.trailSegments = [];
        this.renderFrame();
    }

    /**
     * Fit camera to view all content
     */
    fitToView(bounds) {
        const minX = bounds?.minX ?? 0;
        const minY = bounds?.minY ?? 0;
        const minZ = bounds?.minZ ?? 0;
        const maxX = bounds?.maxX ?? 500;
        const maxY = bounds?.maxY ?? 500;
        const maxZ = bounds?.maxZ ?? 50;

        const sizeX = Math.max(100, maxX - minX);
        const sizeY = Math.max(100, maxY - minY);
        const sizeZ = Math.max(50, maxZ - minZ);
        const maxDim = Math.max(sizeX, sizeY, sizeZ);

        // Calculate center of bounds
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = (minZ + maxZ) / 2;

        // Set camera target to center of work area
        this.controls.target = { x: centerX, y: centerY, z: centerZ };

        // Calculate distance to fit content
        const fov = THREE.MathUtils.degToRad(this.camera.fov);
        const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.8;

        this.controls.radius = distance;
        this.controls.theta = Math.PI / 4;
        this.controls.phi = Math.PI / 3;  // Lower angle for better top-down view
        this.updateCameraFromControls();

        // Update grid position to match work area center
        this.updateGridPosition(centerX, centerY, Math.max(sizeX, sizeY));
    }

    /** Update grid position and size */
    updateGridPosition(centerX, centerY, size) {
        if (this.gridHelper) { this.scene.remove(this.gridHelper); this.gridHelper.geometry?.dispose(); }
        if (this.gridOutline) { this.scene.remove(this.gridOutline); this.gridOutline.geometry?.dispose(); }

        this.gridHelper = new THREE.GridHelper(size, 20, 0x444466, 0x333355);
        this.gridHelper.rotation.x = Math.PI / 2;
        this.gridHelper.position.set(centerX, centerY, 0);
        this.scene.add(this.gridHelper);

        const hw = size / 2;
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([
            centerX - hw, centerY - hw, 0, centerX + hw, centerY - hw, 0,
            centerX + hw, centerY - hw, 0, centerX + hw, centerY + hw, 0,
            centerX + hw, centerY + hw, 0, centerX - hw, centerY + hw, 0,
            centerX - hw, centerY + hw, 0, centerX - hw, centerY - hw, 0
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        this.gridOutline = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x6666ff }));
        this.scene.add(this.gridOutline);
    }

    // === Orbit Controls (from Polar3DViewerAdapter) ===

    initControls() {
        this.controls = {
            enabled: true,
            isDragging: false,
            lastX: 0,
            lastY: 0,
            theta: Math.PI / 4,
            phi: Math.PI / 4,
            radius: 800,
            minRadius: 50,
            maxRadius: 10000,
            target: { x: 0, y: 0, z: 0 }  // Camera look-at target
        };

        this.canvas.style.touchAction = 'none';

        this.handlePointerDown = (e) => {
            if (!this.controls.enabled || e.button !== 0) return;
            this.controls.isDragging = true;
            this.controls.lastX = e.clientX;
            this.controls.lastY = e.clientY;
            this.canvas.setPointerCapture?.(e.pointerId);
        };

        this.handlePointerMove = (e) => {
            if (!this.controls.enabled || !this.controls.isDragging) return;
            const dx = e.clientX - this.controls.lastX;
            const dy = e.clientY - this.controls.lastY;
            this.controls.lastX = e.clientX;
            this.controls.lastY = e.clientY;

            const speed = 0.005;
            this.controls.theta -= dx * speed;
            this.controls.phi += dy * speed;
            this.controls.phi = Math.min(Math.PI - 0.2, Math.max(0.2, this.controls.phi));
            this.updateCameraFromControls();
        };

        this.handlePointerUp = () => {
            if (this.controls) this.controls.isDragging = false;
        };

        this.handleWheel = (e) => {
            if (!this.controls.enabled) return;
            e.preventDefault();
            const factor = e.deltaY > 0 ? 1.1 : 0.9;
            const next = this.controls.radius * factor;
            this.controls.radius = Math.min(this.controls.maxRadius, Math.max(this.controls.minRadius, next));
            this.updateCameraFromControls();
        };

        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    updateCameraFromControls() {
        if (!this.controls || !this.camera) return;
        const { radius, theta, phi, target } = this.controls;

        // Position camera relative to target
        this.camera.position.set(
            target.x + radius * Math.cos(theta) * Math.sin(phi),
            target.y + radius * Math.sin(theta) * Math.sin(phi),
            target.z + radius * Math.cos(phi)
        );
        this.camera.lookAt(target.x, target.y, target.z);
        this.camera.updateProjectionMatrix();
        this.renderFrame();
    }

    // === Resize Handling ===

    observeResize() {
        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.container);
        } else {
            this._handleResize = () => this.resize();
            window.addEventListener('resize', this._handleResize);
        }
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const { width, height } = rect;
        if (width < 2 || height < 2) return;

        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderFrame();
    }

    renderFrame() {
        if (!this.renderer || !this.scene || !this.camera) return;

        // Main scene render
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, this.canvas.width, this.canvas.height);
        this.renderer.render(this.scene, this.camera);

        // ViewCube HUD (bottom-right corner)
        if (this.viewCubeHelper) {
            this.viewCubeHelper.render(this.renderer, this.camera, this.canvas.width, this.canvas.height);
        }
    }

    /**
     * Draw CAD primitives on 3D work surface (Z=0)
     * @param {Array} primitives - Array of primitive objects from CAD
     */
    drawPrimitivesOnSurface(primitives) {
        this.primitiveRenderer.draw(primitives);
        this.renderFrame();
    }

    /** Update live trail during animation */
    updateLiveTrail(points) {
        this.clearLiveTrail();
        if (!points || points.length < 2) return;
        const vertices = new Float32Array(points.length * 3);
        points.forEach((p, i) => { vertices[i * 3] = p.x; vertices[i * 3 + 1] = p.y; vertices[i * 3 + 2] = p.z; });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        this.liveTrailLine = new THREE.Line(geometry, this.liveMaterial);
        this.trailGroup.add(this.liveTrailLine);
        this.renderFrame();
    }

    /** Clear live trail */
    clearLiveTrail() {
        if (this.liveTrailLine) { this.trailGroup.remove(this.liveTrailLine); this.liveTrailLine.geometry.dispose(); this.liveTrailLine = null; }
    }

    // === Cleanup ===

    dispose() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this._handleResize) window.removeEventListener('resize', this._handleResize);

        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        this.canvas.removeEventListener('wheel', this.handleWheel);

        this.clearTrail();
        this.primitiveRenderer?.dispose();
        this.viewCubeHelper?.dispose();
        this.renderer?.dispose();
    }
}

export default PLCSimulator3D;
