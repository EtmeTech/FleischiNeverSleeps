import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export class HorrorPostProcessing {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.isMobile = !!(typeof window !== 'undefined' && window.__fnsIsMobile);

        if (this.isMobile) {
            this.composer = {
                render: () => {
                    if (this.renderer && this.scene && this.camera) {
                        this.renderer.render(this.scene, this.camera);
                    }
                },
                setSize: (w, h) => {
                    if (this.renderer) this.renderer.setSize(w, h);
                },
                addPass: () => {},
                passes: []
            };
            return;
        }

        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        // Custom VHS & Vignette Shader
        const vhsShader = {
            uniforms: {
                "tDiffuse": { value: null },
                "time": { value: 0.0 },
                "resolution": { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float time;
                varying vec2 vUv;

                // Random noise function
                float rand(vec2 co) {
                    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
                }

                void main() {
                    vec2 uv = vUv;

                    // Subtle wave distortion
                    uv.x += sin(uv.y * 10.0 + time * 5.0) * 0.002;
                    
                    vec4 texColor = texture2D(tDiffuse, uv);
                    
                    // RGB Shift
                    float shift = 0.003 * sin(time * 2.0);
                    vec4 colorR = texture2D(tDiffuse, uv + vec2(shift, 0.0));
                    vec4 colorB = texture2D(tDiffuse, uv - vec2(shift, 0.0));
                    texColor.r = colorR.r;
                    texColor.b = colorB.b;

                    // Vignette
                    float dist = distance(uv, vec2(0.5, 0.5));
                    texColor.rgb *= smoothstep(0.8, 0.2, dist * 1.2);

                    // Film Grain
                    float noise = (rand(uv * time) - 0.5) * 0.15;
                    texColor.rgb += noise;

                    gl_FragColor = texColor;
                }
            `
        };

        this.vhsPass = new ShaderPass(vhsShader);
        this.composer.addPass(this.vhsPass);
    }

    render(delta) {
        if (this.isMobile) {
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
            return;
        }
        this.vhsPass.uniforms["time"].value += delta;
        this.composer.render();
    }

    setSize(width, height) {
        if (this.isMobile) {
            if (this.renderer) {
                this.renderer.setSize(width, height);
            }
            return;
        }
        this.composer.setSize(width, height);
        this.vhsPass.uniforms["resolution"].value.set(width, height);
    }

    setVignetteIntensity() {}
    triggerGlitch() {}
    triggerJumpscare() {}
    triggerJumpscareEffect() {}
    update() {}
}
