/**
 * PLCSimulator3D - Three.js 3D visualization for PLC command execution
 * Features: Tool mesh, trail rendering, orbit controls
 * Uses single Three.js instance via webpack bundle for compatibility
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { BRANDING_CSS, injectBranding } from '../lib/branding.js';
import { ViewCubeHelper } from './ViewCubeHelper.js';
import { PrimitiveRenderer3D } from './PrimitiveRenderer3D.js';

// How much of the way to the tool the camera goes at every step while it follows it
const FOLLOW_STEP = 0.2;

export class PLCSimulator3D {
    constructor(canvas) {
        if (!canvas) {
            throw new Error('PLCSimulator3D requires a canvas element');
        }

        this.canvas = canvas;
        this.container = canvas.parentElement || canvas;

        // The camera keeps the tool in view while this is on; a pan turns it off again
        this.followTool = false;
        // Called with the new state whenever it changes, so the toolbar can show it
        this.onFollowChange = null;

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        // Camera (Z-up coordinate system)
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        this.camera.up.set(0, 0, 1);  // Z is up in this app
        this.camera.position.set(500, 500, 500);
        this.camera.lookAt(0, 0, 0);

        // Renderer - optimized for industrial/limited hardware
        // Try WebGL2 first, fall back to WebGL1
        let context = null;
        try {
            context = this.canvas.getContext('webgl2', { antialias: true, alpha: true });
        } catch (_e) { /* WebGL2 not available */ }
        if (!context) {
            try {
                context = this.canvas.getContext('webgl', { antialias: true, alpha: true });
            } catch (_e) { /* WebGL1 not available */ }
        }

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            context: context,
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',  // Prefer integrated GPU
            failIfMajorPerformanceCaveat: false  // Allow software rendering
        });

        // Clamp pixel ratio for industrial displays (high DPI kills performance)
        const maxPixelRatio = 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
        // Canvas size in CSS pixels, reused by every frame
        this.viewSize = new THREE.Vector2();

        // Handle WebGL context loss (common on industrial/embedded systems)
        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            console.warn('WebGL context lost - will restore on next frame');
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
            this.resize();
        });

        // Trail data - high contrast colors for clear progress visibility
        this.trailSegments = [];

        // Thin material for rapids (don't need thick lines)
        this.rapidMaterial = new THREE.LineBasicMaterial({ color: 0x333344, linewidth: 1 });

        // Thick LineMaterial for cut trails (3px wide, bright green)
        this.cutMaterial = new LineMaterial({
            color: 0x00ff88,
            linewidth: 3,  // In pixels
            worldUnits: false,
            dashed: false
        });

        // Thick LineMaterial for live/active trail (4px wide, white)
        this.liveMaterial = new LineMaterial({
            color: 0xffffff,
            linewidth: 4,
            worldUnits: false,
            dashed: false
        });

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

        // Camera animation state
        this.cameraAnimation = {
            isAnimating: false,
            startTheta: 0,
            startPhi: 0,
            targetTheta: 0,
            targetPhi: 0,
            startTime: 0,
            duration: 400  // ms
        };
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

    /**
     * Show the piece being cut as a block from the bed (z0) to its top (z1), over the given
     * bounds. Called again with no piece (or with nothing to cut) it leaves the scene empty.
     * @param {{minX: number, minY: number, maxX: number, maxY: number, z0: number, z1: number}|null} stock
     */
    setStock(stock) {
        this.clearStock();
        if (!stock) return;

        const { minX, minY, maxX, maxY, z0, z1 } = stock;
        const width = maxX - minX, depth = maxY - minY, height = z1 - z0;
        if (!(width > 0 && depth > 0 && height > 0)) return;

        // Transparent and out of the depth buffer, so the path inside the material stays visible
        const material = new THREE.MeshStandardMaterial({
            color: 0xb08d57, transparent: true, opacity: 0.25, depthWrite: false,
            roughness: 0.9, metalness: 0, side: THREE.DoubleSide
        });
        this.stockMesh = new THREE.Mesh(new THREE.BoxGeometry(width, depth, height), material);
        this.stockMesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (z0 + z1) / 2);
        this.scene.add(this.stockMesh);

        // The edges keep the block readable where it is nearly edge-on
        this.stockEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(this.stockMesh.geometry),
            new THREE.LineBasicMaterial({ color: 0xb08d57, transparent: true, opacity: 0.6 })
        );
        this.stockEdges.position.copy(this.stockMesh.position);
        this.scene.add(this.stockEdges);
        this.renderFrame();
    }

    /** Take the piece out of the scene and give its geometry and materials back */
    clearStock() {
        for (const key of ['stockMesh', 'stockEdges']) {
            const object = this[key];
            if (!object) continue;
            this.scene.remove(object);
            object.geometry.dispose();
            object.material.dispose();
            this[key] = null;
        }
    }

    createDefaultTool(diameter, height) {
        const group = new THREE.Group();
        const radius = diameter / 2;
        const tipHeight = height * 0.25;
        const bodyHeight = height * 0.6;
        const holderHeight = height * 0.15;

        // Cone tip - BLUE
        // ConeGeometry: tip at +Y, base at -Y (centered at origin)
        // We want tip pointing DOWN (-Z) with tip point at local Z=0
        const tipGeom = new THREE.ConeGeometry(radius, tipHeight, 32);
        const tipMat = new THREE.MeshPhongMaterial({ color: 0x2266ff, shininess: 100 });
        const tip = new THREE.Mesh(tipGeom, tipMat);
        // Shift geometry so tip vertex is at local origin
        tipGeom.translate(0, -tipHeight / 2, 0);
        // Rotate -90° around X to point tip down (-Z), base goes to +Z
        tip.rotation.x = -Math.PI / 2;
        group.add(tip);

        // Cylinder body - SILVER/GRAY (above the tip)
        const bodyGeom = new THREE.CylinderGeometry(radius, radius, bodyHeight, 32);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, shininess: 80 });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.rotation.x = -Math.PI / 2;
        body.position.z = tipHeight + bodyHeight / 2;
        group.add(body);

        // Holder cylinder - DARK
        const holderGeom = new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, holderHeight, 32);
        const holderMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const holder = new THREE.Mesh(holderGeom, holderMat);
        holder.rotation.x = -Math.PI / 2;
        holder.position.z = tipHeight + bodyHeight + holderHeight / 2;
        group.add(holder);

        return group;
    }

    /**
     * Set tool position
     */
    setToolPosition(x, y, z) {
        this.toolMesh.position.set(x, y, z);
        // followStep draws the frame itself, through updateCameraFromControls
        if (this.followTool) this.followStep(FOLLOW_STEP);
        else this.renderFrame();
    }

    /**
     * Keep the camera on the tool, or let it go. What the camera looks at moves; the angle and
     * the distance stay as the user set them, so orbiting and zooming keep working while it
     * follows. Turning it on takes the view to the tool at once.
     * @param {boolean} on
     */
    setFollowTool(on) {
        if (this.followTool === on) return;
        this.followTool = on;
        if (on) this.followStep(1);
        this.onFollowChange?.(on);
    }

    /**
     * Move what the camera looks at part of the way to the tool. A whole step would make every
     * rapid jerk the scene; a fraction of the distance follows without the jolt.
     * @param {number} fraction of the remaining distance to cover, 1 to arrive at once
     */
    followStep(fraction) {
        const target = this.controls?.target;
        const tool = this.toolMesh?.position;
        if (!target || !tool) return;
        target.x += (tool.x - target.x) * fraction;
        target.y += (tool.y - target.y) * fraction;
        target.z += (tool.z - target.z) * fraction;
        this.updateCameraFromControls();
    }

    /**
     * Add trail segment
     * @param {Object} from - {x, y, z}
     * @param {Object} to - {x, y, z}
     * @param {boolean} isRapid - true for rapid (thin), false for cut (thick)
     */
    addTrailSegment(from, to, isRapid = false) {
        let line;

        if (isRapid) {
            // Rapids use thin LineBasicMaterial (1px)
            const geometry = new THREE.BufferGeometry();
            const vertices = new Float32Array([
                from.x, from.y, from.z,
                to.x, to.y, to.z
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            line = new THREE.Line(geometry, this.rapidMaterial);
        } else {
            // Cut moves use thick Line2 (3px)
            const geometry = new LineGeometry();
            geometry.setPositions([
                from.x, from.y, from.z,
                to.x, to.y, to.z
            ]);
            // Update resolution for proper line width
            this.cutMaterial.resolution.set(this.canvas.width, this.canvas.height);
            line = new Line2(geometry, this.cutMaterial);
            line.computeLineDistances();
        }

        this.trailGroup.add(line);
        this.trailSegments.push(line);
        this.renderFrame();
    }

    /**
     * Add arc trail segment (curved line with thick rendering)
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

        // Generate points along the arc (flat array for LineGeometry)
        const positions = [];
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

            positions.push(x, y, z);
        }

        // Use thick Line2 for arcs (always cut moves)
        const geometry = new LineGeometry();
        geometry.setPositions(positions);

        // Update resolution for proper line width
        this.cutMaterial.resolution.set(this.canvas.width, this.canvas.height);

        const line = new Line2(geometry, this.cutMaterial);
        line.computeLineDistances();
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
            isPanning: false,
            dragButton: -1,  // Track which button started drag
            lastX: 0,
            lastY: 0,
            theta: Math.PI / 4,
            phi: Math.PI / 4,
            radius: 800,
            minRadius: 50,
            maxRadius: 10000,
            target: { x: 0, y: 0, z: 0 },  // Camera look-at target
            // Touch gesture state
            touches: [],
            lastPinchDist: 0,
            lastTouchCenter: { x: 0, y: 0 }
        };

        this.canvas.style.touchAction = 'none';

        // === TOUCH EVENTS (for tablets/HMI) ===
        this.handleTouchStart = (e) => {
            if (!this.controls.enabled) return;
            e.preventDefault();

            this.controls.touches = Array.from(e.touches);

            if (e.touches.length === 1) {
                // Single touch - check ViewCube first
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;

                if (this.viewCubeHelper) {
                    const viewPreset = this.viewCubeHelper.handleClick(x, y, rect.width, rect.height);
                    if (viewPreset) {
                        this.animateToView(viewPreset.theta, viewPreset.phi);
                        return;
                    }
                }

                // Single finger = orbit
                this.controls.isDragging = true;
                this.controls.isPanning = false;
                this.controls.lastX = touch.clientX;
                this.controls.lastY = touch.clientY;
            } else if (e.touches.length === 2) {
                // Two fingers = pan + pinch zoom
                this.controls.isDragging = true;
                this.controls.isPanning = true;

                const t1 = e.touches[0], t2 = e.touches[1];
                this.controls.lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                this.controls.lastTouchCenter = {
                    x: (t1.clientX + t2.clientX) / 2,
                    y: (t1.clientY + t2.clientY) / 2
                };
            }
        };

        this.handleTouchMove = (e) => {
            if (!this.controls.enabled || !this.controls.isDragging) return;
            e.preventDefault();

            if (e.touches.length === 1 && !this.controls.isPanning) {
                // Single finger orbit
                const touch = e.touches[0];
                const dx = touch.clientX - this.controls.lastX;
                const dy = touch.clientY - this.controls.lastY;
                this.controls.lastX = touch.clientX;
                this.controls.lastY = touch.clientY;

                const speed = 0.005;
                this.controls.theta -= dx * speed;
                this.controls.phi += dy * speed;
                this.controls.phi = Math.min(Math.PI - 0.1, Math.max(0.1, this.controls.phi));
                this.updateCameraFromControls();
            } else if (e.touches.length === 2) {
                const t1 = e.touches[0], t2 = e.touches[1];

                // Pinch zoom
                const pinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                if (this.controls.lastPinchDist > 0) {
                    const zoomFactor = this.controls.lastPinchDist / pinchDist;
                    this.zoom(zoomFactor);
                }
                this.controls.lastPinchDist = pinchDist;

                // Two-finger pan
                const centerX = (t1.clientX + t2.clientX) / 2;
                const centerY = (t1.clientY + t2.clientY) / 2;
                const dx = centerX - this.controls.lastTouchCenter.x;
                const dy = centerY - this.controls.lastTouchCenter.y;
                this.controls.lastTouchCenter = { x: centerX, y: centerY };

                // Two fingers aim the view: the tool stops carrying it
                this.setFollowTool(false);
                const panSpeed = this.controls.radius * 0.001;
                const right = new THREE.Vector3();
                right.setFromMatrixColumn(this.camera.matrixWorld, 0);
                const up = new THREE.Vector3();
                up.setFromMatrixColumn(this.camera.matrixWorld, 1);

                this.controls.target.x -= (dx * right.x - dy * up.x) * panSpeed;
                this.controls.target.y -= (dx * right.y - dy * up.y) * panSpeed;
                this.controls.target.z -= (dx * right.z - dy * up.z) * panSpeed;
                this.updateCameraFromControls();
            }
        };

        this.handleTouchEnd = (e) => {
            if (e.touches.length === 0) {
                this.controls.isDragging = false;
                this.controls.isPanning = false;
                this.controls.lastPinchDist = 0;
            } else if (e.touches.length === 1) {
                // Switched from 2 fingers to 1 - reset to orbit
                this.controls.isPanning = false;
                this.controls.lastX = e.touches[0].clientX;
                this.controls.lastY = e.touches[0].clientY;
            }
            this.controls.touches = Array.from(e.touches);
        };

        // === MOUSE/POINTER EVENTS ===
        this.handlePointerDown = (e) => {
            if (!this.controls.enabled) return;
            if (e.pointerType === 'touch') return; // Handled by touch events

            // Check ViewCube click first (left button only)
            if (e.button === 0) {
                const rect = this.canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                if (this.viewCubeHelper) {
                    const viewPreset = this.viewCubeHelper.handleClick(x, y, rect.width, rect.height);
                    if (viewPreset) {
                        this.animateToView(viewPreset.theta, viewPreset.phi);
                        return;  // Don't start orbit drag
                    }
                }
            }

            // Left button = orbit, Right/Middle button = pan
            if (e.button === 0) {
                this.controls.isDragging = true;
                this.controls.isPanning = false;
            } else if (e.button === 1 || e.button === 2) {
                this.controls.isDragging = true;
                this.controls.isPanning = true;
                e.preventDefault();
            }

            this.controls.dragButton = e.button;
            this.controls.lastX = e.clientX;
            this.controls.lastY = e.clientY;
            this.canvas.setPointerCapture?.(e.pointerId);
        };

        this.handlePointerMove = (e) => {
            if (!this.controls.enabled || !this.controls.isDragging) return;
            if (e.pointerType === 'touch') return; // Handled by touch events

            const dx = e.clientX - this.controls.lastX;
            const dy = e.clientY - this.controls.lastY;
            this.controls.lastX = e.clientX;
            this.controls.lastY = e.clientY;

            if (this.controls.isPanning) {
                // Pan mode: move camera target in screen-aligned directions. The user is aiming
                // the view, so the tool stops carrying it.
                this.setFollowTool(false);
                const panSpeed = this.controls.radius * 0.001;

                const right = new THREE.Vector3();
                right.setFromMatrixColumn(this.camera.matrixWorld, 0);
                const up = new THREE.Vector3();
                up.setFromMatrixColumn(this.camera.matrixWorld, 1);

                this.controls.target.x -= (dx * right.x - dy * up.x) * panSpeed;
                this.controls.target.y -= (dx * right.y - dy * up.y) * panSpeed;
                this.controls.target.z -= (dx * right.z - dy * up.z) * panSpeed;
            } else {
                // Orbit mode: rotate around target
                const speed = 0.005;
                this.controls.theta -= dx * speed;
                this.controls.phi += dy * speed;
                this.controls.phi = Math.min(Math.PI - 0.1, Math.max(0.1, this.controls.phi));
            }
            this.updateCameraFromControls();
        };

        this.handlePointerUp = (e) => {
            if (e.pointerType === 'touch') return; // Handled by touch events
            if (this.controls && this.controls.dragButton === e.button) {
                this.controls.isDragging = false;
                this.controls.isPanning = false;
                this.controls.dragButton = -1;
            }
        };

        this.handleWheel = (e) => {
            if (!this.controls.enabled) return;
            e.preventDefault();

            const factor = e.deltaY > 0 ? 1.15 : 0.87;
            this.zoom(factor);
        };

        // Prevent context menu on right-click (we use it for panning)
        this.handleContextMenu = (e) => {
            e.preventDefault();
        };

        // Touch events for tablets/HMI
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd);
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd);

        // Pointer events for mouse
        this.canvas.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointermove', this.handlePointerMove);
        window.addEventListener('pointerup', this.handlePointerUp);
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this.handleContextMenu);
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

    /**
     * Zoom by factor (>1 = zoom out, <1 = zoom in)
     */
    zoom(factor) {
        if (!this.controls) return;
        const newRadius = this.controls.radius * factor;
        this.controls.radius = Math.min(this.controls.maxRadius, Math.max(this.controls.minRadius, newRadius));
        this.updateCameraFromControls();
    }

    /**
     * Zoom in (for button)
     */
    zoomIn() {
        this.zoom(0.8);
    }

    /**
     * Zoom out (for button)
     */
    zoomOut() {
        this.zoom(1.25);
    }

    /**
     * Zoom to fit all content (extent) with 180° rotated view
     */
    zoomExtent() {
        // Calculate bounds from trail segments and primitives
        const bounds = this.calculateSceneBounds();
        this.fitToView(bounds);

        // Rotate to standard 180° + 45° isometric view
        this.controls.theta = Math.PI + Math.PI / 4;
        this.controls.phi = Math.PI / 3;
        this.updateCameraFromControls();
    }

    /**
     * Rotate view by 90° clockwise (looking down Z axis)
     */
    rotate90CW() {
        this.animateToView(this.controls.theta - Math.PI / 2, this.controls.phi);
    }

    /**
     * Rotate view by 90° counter-clockwise
     */
    rotate90CCW() {
        this.animateToView(this.controls.theta + Math.PI / 2, this.controls.phi);
    }

    /**
     * Calculate bounding box of all visible content
     */
    calculateSceneBounds() {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let hasContent = false;

        // Check trail segments
        for (const segment of this.trailSegments) {
            const pos = segment.geometry.getAttribute('position');
            if (pos) {
                for (let i = 0; i < pos.count; i++) {
                    minX = Math.min(minX, pos.getX(i));
                    minY = Math.min(minY, pos.getY(i));
                    minZ = Math.min(minZ, pos.getZ(i));
                    maxX = Math.max(maxX, pos.getX(i));
                    maxY = Math.max(maxY, pos.getY(i));
                    maxZ = Math.max(maxZ, pos.getZ(i));
                    hasContent = true;
                }
            }
        }

        // Check primitive renderer bounds
        if (this.primitiveRenderer && this.primitiveRenderer.group) {
            this.primitiveRenderer.group.traverse((obj) => {
                if (obj.geometry) {
                    const pos = obj.geometry.getAttribute('position');
                    if (pos) {
                        for (let i = 0; i < pos.count; i++) {
                            minX = Math.min(minX, pos.getX(i));
                            minY = Math.min(minY, pos.getY(i));
                            minZ = Math.min(minZ, pos.getZ(i));
                            maxX = Math.max(maxX, pos.getX(i));
                            maxY = Math.max(maxY, pos.getY(i));
                            maxZ = Math.max(maxZ, pos.getZ(i));
                            hasContent = true;
                        }
                    }
                }
            });
        }

        // Check tool position
        if (this.toolMesh) {
            const toolPos = this.toolMesh.position;
            minX = Math.min(minX, toolPos.x);
            minY = Math.min(minY, toolPos.y);
            minZ = Math.min(minZ, toolPos.z);
            maxX = Math.max(maxX, toolPos.x);
            maxY = Math.max(maxY, toolPos.y);
            maxZ = Math.max(maxZ, toolPos.z);
            hasContent = true;
        }

        if (!hasContent) {
            return { minX: 0, minY: 0, minZ: 0, maxX: 500, maxY: 500, maxZ: 50 };
        }

        // Add padding
        const padX = (maxX - minX) * 0.1 || 50;
        const padY = (maxY - minY) * 0.1 || 50;
        const padZ = (maxZ - minZ) * 0.1 || 10;

        return {
            minX: minX - padX,
            minY: minY - padY,
            minZ: minZ - padZ,
            maxX: maxX + padX,
            maxY: maxY + padY,
            maxZ: maxZ + padZ
        };
    }

    /**
     * Animate camera to preset view (smooth transition)
     * @param {number} targetTheta - Target azimuth angle
     * @param {number} targetPhi - Target elevation angle
     */
    animateToView(targetTheta, targetPhi) {
        if (!this.cameraAnimation) return;

        // Normalize angles for shortest path
        let startTheta = this.controls.theta;
        let diff = targetTheta - startTheta;
        if (diff > Math.PI) startTheta += 2 * Math.PI;
        if (diff < -Math.PI) startTheta -= 2 * Math.PI;

        this.cameraAnimation.startTheta = startTheta;
        this.cameraAnimation.startPhi = this.controls.phi;
        this.cameraAnimation.targetTheta = targetTheta;
        this.cameraAnimation.targetPhi = targetPhi;
        this.cameraAnimation.startTime = performance.now();
        this.cameraAnimation.isAnimating = true;

        this.animateCameraStep();
    }

    /**
     * Animation step for camera transition
     */
    animateCameraStep() {
        if (!this.cameraAnimation.isAnimating) return;

        const elapsed = performance.now() - this.cameraAnimation.startTime;
        const t = Math.min(1, elapsed / this.cameraAnimation.duration);

        // Ease out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - t, 3);

        this.controls.theta = this.cameraAnimation.startTheta +
            (this.cameraAnimation.targetTheta - this.cameraAnimation.startTheta) * eased;
        this.controls.phi = this.cameraAnimation.startPhi +
            (this.cameraAnimation.targetPhi - this.cameraAnimation.startPhi) * eased;

        this.updateCameraFromControls();

        if (t < 1) {
            requestAnimationFrame(() => this.animateCameraStep());
        } else {
            this.cameraAnimation.isAnimating = false;
        }
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

        // Use clamped pixel ratio for industrial displays
        const maxPixelRatio = 1.5;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Update LineMaterial resolution for proper line width
        this.cutMaterial.resolution.set(width, height);
        this.liveMaterial.resolution.set(width, height);

        this.renderFrame();
    }

    renderFrame() {
        if (!this.renderer || !this.scene || !this.camera) return;

        // Main scene render. setViewport takes CSS pixels and scales them by the pixel ratio, so the
        // drawing buffer size (canvas.width) would enlarge the scene past the canvas above ratio 1
        this.renderer.getSize(this.viewSize);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, this.viewSize.x, this.viewSize.y);
        this.renderer.render(this.scene, this.camera);

        // ViewCube HUD (bottom-right corner)
        if (this.viewCubeHelper) {
            this.viewCubeHelper.render(this.renderer, this.camera, this.viewSize.x);
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

    /** Update live trail during animation (thick white line) */
    updateLiveTrail(points) {
        this.clearLiveTrail();
        if (!points || points.length < 2) return;

        // Build flat position array for LineGeometry
        const positions = [];
        points.forEach(p => positions.push(p.x, p.y, p.z));

        const geometry = new LineGeometry();
        geometry.setPositions(positions);

        // Update resolution for proper line width
        this.liveMaterial.resolution.set(this.canvas.width, this.canvas.height);

        this.liveTrailLine = new Line2(geometry, this.liveMaterial);
        this.liveTrailLine.computeLineDistances();
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

        // Remove touch listeners
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);

        // Remove pointer/mouse listeners
        this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        this.canvas.removeEventListener('wheel', this.handleWheel);
        this.canvas.removeEventListener('contextmenu', this.handleContextMenu);

        this.clearTrail();
        this.clearStock();

        // Dispose LineMaterials
        this.rapidMaterial?.dispose();
        this.cutMaterial?.dispose();
        this.liveMaterial?.dispose();

        this.primitiveRenderer?.dispose();
        this.viewCubeHelper?.dispose();
        this.renderer?.dispose();
    }
}

export default PLCSimulator3D;
