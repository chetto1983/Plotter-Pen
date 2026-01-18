/**
 * ViewCubeHelper - Navigation cube HUD for 3D orientation
 * Renders a small cube in the corner that rotates with the camera
 */

export class ViewCubeHelper {
    constructor(THREE) {
        this.THREE = THREE;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        this.cube = null;
        this.axes = null;
        this.size = 100;
        this.margin = 10;

        this.init();
    }

    init() {
        const THREE = this.THREE;

        // Create cube with labeled faces
        const cubeGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        const materials = [
            this.createFaceMaterial('X+', 0xff6666),  // +X (red)
            this.createFaceMaterial('X-', 0xff6666),  // -X (red)
            this.createFaceMaterial('Z+', 0x66ff66),  // +Z top (green)
            this.createFaceMaterial('Z-', 0x66ff66),  // -Z bottom (green)
            this.createFaceMaterial('Y+', 0x6688ff),  // +Y (blue)
            this.createFaceMaterial('Y-', 0x6688ff),  // -Y (blue)
        ];
        this.cube = new THREE.Mesh(cubeGeo, materials);
        this.scene.add(this.cube);

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
     * Create a material with label for cube face
     */
    createFaceMaterial(label, color) {
        const THREE = this.THREE;
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fillRect(0, 0, 128, 128);

        // Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, 124, 124);

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        return new THREE.MeshBasicMaterial({ map: texture });
    }

    /**
     * Render the ViewCube in the corner of the canvas
     * @param {THREE.WebGLRenderer} renderer - The main renderer
     * @param {THREE.Camera} mainCamera - The main scene camera
     * @param {number} canvasWidth - Canvas width in pixels
     * @param {number} canvasHeight - Canvas height in pixels
     */
    render(renderer, mainCamera, canvasWidth, canvasHeight) {
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
     * Update size and margin
     */
    setSize(size, margin = 10) {
        this.size = size;
        this.margin = margin;
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
        if (this.axes) {
            this.axes.geometry.dispose();
            this.axes.material.dispose();
        }
    }
}

export default ViewCubeHelper;
