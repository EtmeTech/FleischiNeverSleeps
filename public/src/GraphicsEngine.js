import * as THREE from 'three';

export class GraphicsEngine {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.setupRenderer();
        this.setupEnvironmentLights();
    }

    setupRenderer() {
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;
    }

    setupEnvironmentLights() {
        const hemiLight = new THREE.HemisphereLight(0x222233, 0x050505, 0.4);
        this.scene.add(hemiLight);
    }

    createFlickeringLight(color, intensity, distance, position) {
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
