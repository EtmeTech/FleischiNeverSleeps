import * as THREE from 'three';
if (typeof window !== 'undefined') { window.THREE = THREE; }

export class GraphicsEngine {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.isMobile = !!(typeof window !== 'undefined' && window.__fnsIsMobile);
        this.setupRenderer();
        this.setupEnvironmentLights();
    }

    setupRenderer() {
        if (this.isMobile) {
            this.renderer.shadowMap.enabled = false;
            this.renderer.shadowMap.autoUpdate = false;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.NoToneMapping;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1.0, 0.75));
        } else {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.outputColorSpace = THREE.SRGBColorSpace;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 0.8;
        }
    }

    setupEnvironmentLights() {
        if (this.isMobile) {
            const hemiLight = new THREE.HemisphereLight(0xdcdcf0, 0x333344, 1.4);
            hemiLight.__fnsAllowedLight = true;
            this.scene.add(hemiLight);
            const dirLight = new THREE.DirectionalLight(0xffeedd, 0.85);
            dirLight.position.set(5, 12, 7);
            dirLight.__fnsAllowedLight = true;
            this.scene.add(dirLight);
        } else {
            const hemiLight = new THREE.HemisphereLight(0x222233, 0x050505, 0.4);
            this.scene.add(hemiLight);
        }
    }

    createFlickeringLight(color, intensity, distance, position) {
        if (this.isMobile) {
            const dummy = new THREE.Object3D();
            dummy.position.copy(position);
            dummy.intensity = intensity;
            return dummy;
        }
        const light = new THREE.PointLight(color, intensity, distance);
        light.position.copy(position);
        light.castShadow = true;
        light.shadow.bias = -0.001;
        light.shadow.mapSize.width = 1024;
        light.shadow.mapSize.height = 1024;
        this.scene.add(light);
        return light;
    }
}
