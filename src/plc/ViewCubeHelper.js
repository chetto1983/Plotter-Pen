/**
 * ViewCubeHelper - Navigation cube HUD for 3D orientation
 * Renders a clickable cube in the corner for changing camera view
 * AutoCAD-style: click faces/edges/corners for preset views
 */

export class ViewCubeHelper {
    constructor(THREE) {
        this.THREE = THREE;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        this.cube = null;
        this.axes = null;
        this.size = 120;  // Larger for better touch targets
        this.margin = 10;

        // Raycaster for click detection
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // View presets (spherical coordinates: theta=azimuth, phi=elevation)
        // Matching AutoCAD/Fusion360 standard views
        this.viewPresets = {
            'TOP':      { theta: 0, phi: 0.001 },           // Z+ looking down
            'BOTTOM':   { theta: 0, phi: Math.PI - 0.001 }, // Z- looking up
            'FRONT':    { theta: 0, phi: Math.PI / 2 },     // Y- looking at front
            'BACK':     { theta: Math.PI, phi: Math.PI / 2 }, // Y+ looking at back
            'RIGHT':    { theta: Math.PI / 2, phi: Math.PI / 2 },  // X+ right side
            'LEFT':     { theta: -Math.PI / 2, phi: Math.PI / 2 }, // X- left side
            'ISO_NE':   { theta: Math.PI / 4, phi: Math.PI / 3 },  // Northeast isometric
            'ISO_NW':   { theta: 3 * Math.PI / 4, phi: Math.PI / 3 },
            'ISO_SE':   { theta: -Math.PI / 4, phi: Math.PI / 3 },
            'ISO_SW':   { theta: -3 * Math.PI / 4, phi: Math.PI / 3 }
        };

        this.init();
    }

    init() {
        const THREE = this.THREE;

        // Create cube with labeled faces (AutoCAD style labels)
        const cubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        const materials = [
            this.createFaceMaterial('RIGHT', 0x445566, 'RIGHT'),   // +X
            this.createFaceMaterial('LEFT', 0x445566, 'LEFT'),     // -X
            this.createFaceMaterial('TOP', 0x446655, 'TOP'),       // +Z (green-ish)
            this.createFaceMaterial('BOTTOM', 0x445566, 'BOTTOM'), // -Z
            this.createFaceMaterial('FRONT', 0x445566, 'FRONT'),   // +Y
            this.createFaceMaterial('BACK', 0x445566, 'BACK'),     // -Y
        ];
        this.cube = new THREE.Mesh(cubeGeo, materials);
        this.cube.userData.clickable = true;
        this.scene.add(this.cube);

        // Edge highlights for corner clicks (isometric views)
        this.createEdgeHighlights();

        // Mini axes on cube (RGB = XYZ)
        this.axes = new THREE.AxesHelper(1.0);
        this.scene.add(this.axes);

        // Lighting
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 2, 5);
        this.scene.add(light);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    }

    /**
     * Create edge highlights for corner detection
     */
    createEdgeHighlights() {
        const THREE = this.THREE;
        const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.42, 1.42, 1.42));
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x88aacc, linewidth: 2 });
        this.edges = new THREE.LineSegments(edgeGeo, edgeMat);
        this.scene.add(this.edges);
    }

    /**
     * Create a material with label for cube face
     * @param {string} label - Display text
     * @param {number} color - Base color
     * @param {string} viewName - View preset name for click detection
     */
    createFaceMaterial(label, color, viewName) {
        const THREE = this.THREE;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Background with gradient for 3D effect
        const gradient = ctx.createLinearGradient(0, 0, 128, 128);
        const baseColor = `#${color.toString(16).padStart(6, '0')}`;
        gradient.addColorStop(0, this.lightenColor(baseColor, 20));
        gradient.addColorStop(1, baseColor);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);

        // Border
        ctx.strokeStyle = '#88aacc';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 124, 124);

        // Label (smaller font for longer text)
        ctx.fillStyle = '#ffffff';
        ctx.font = label.length > 4 ? 'bold 24px Arial' : 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        material.userData = { viewName, label };
        return material;
    }

    /**
     * Lighten a hex color
     */
    lightenColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
    }

    /**
     * Handle click/tap on ViewCube
     * @param {number} clientX - Click X position in viewport
     * @param {number} clientY - Click Y position in viewport
     * @param {number} canvasWidth - Canvas width
     * @param {number} canvasHeight - Canvas height
     * @returns {Object|null} View preset if clicked, null otherwise
     */
    handleClick(clientX, clientY, canvasWidth, canvasHeight) {
        // Check if click is within ViewCube bounds
        const cubeX = canvasWidth - this.size - this.margin;
        const cubeY = this.margin;

        // Viewport coords (0,0 at bottom-left in WebGL)
        const viewportX = clientX;
        const viewportY = canvasHeight - clientY;

        if (viewportX < cubeX || viewportX > cubeX + this.size ||
            viewportY < cubeY || viewportY > cubeY + this.size) {
            return null;
        }

        // Convert to normalized device coords for cube viewport (-1 to 1)
        const localX = viewportX - cubeX;
        const localY = viewportY - cubeY;
        this.mouse.x = (localX / this.size) * 2 - 1;
        this.mouse.y = (localY / this.size) * 2 - 1;

        // Raycast against cube
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObject(this.cube);

        if (intersects.length > 0) {
            const faceIndex = intersects[0].faceIndex;
            const materialIndex = Math.floor(faceIndex / 2); // Each face has 2 triangles
            const material = this.cube.material[materialIndex];
            const viewName = material.userData?.viewName;

            if (viewName && this.viewPresets[viewName]) {
                return this.viewPresets[viewName];
            }
        }

        // Check for corner click (isometric views)
        const cornerView = this.detectCornerClick(this.mouse.x, this.mouse.y);
        if (cornerView) {
            return this.viewPresets[cornerView];
        }

        return null;
    }

    /**
     * Detect if click is near a corner (for isometric views)
     */
    detectCornerClick(normalizedX, normalizedY) {
        const threshold = 0.3;  // Near edge threshold

        // Near corners = isometric views
        if (Math.abs(normalizedX) > 1 - threshold && Math.abs(normalizedY) > 1 - threshold) {
            if (normalizedX > 0 && normalizedY > 0) return 'ISO_NE';
            if (normalizedX < 0 && normalizedY > 0) return 'ISO_NW';
            if (normalizedX > 0 && normalizedY < 0) return 'ISO_SE';
            if (normalizedX < 0 && normalizedY < 0) return 'ISO_SW';
        }
        return null;
    }

    /**
     * Render the ViewCube in the corner of the canvas
     * @param {THREE.WebGLRenderer} renderer - The main renderer
     * @param {THREE.Camera} mainCamera - The main scene camera
     * @param {number} canvasWidth - Canvas width in CSS pixels, the unit of setViewport, like size and
     *   margin; the WebGL viewport starts at the bottom, so the bottom-right corner needs no height
     */
    render(renderer, mainCamera, canvasWidth) {
        if (!this.cube) return;

        // Sync cube rotation with main camera (inverse)
        this.cube.quaternion.copy(mainCamera.quaternion).invert();

        // Position in bottom-right corner
        const x = canvasWidth - this.size - this.margin;
        const y = this.margin;

        renderer.setViewport(x, y, this.size, this.size);
        renderer.setScissor(x, y, this.size, this.size);
        renderer.setScissorTest(true);
        renderer.render(this.scene, this.camera);
        renderer.setScissorTest(false);
    }

    /**
     * Cleanup
     */
    dispose() {
        if (this.cube) {
            this.cube.geometry.dispose();
            this.cube.material.forEach(m => {
                m.map?.dispose();
                m.dispose();
            });
        }
        if (this.edges) {
            this.edges.geometry.dispose();
            this.edges.material.dispose();
        }
        if (this.axes) {
            this.axes.geometry.dispose();
            this.axes.material.dispose();
        }
    }
}

export default ViewCubeHelper;
