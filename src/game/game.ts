import * as THREE from 'three';
import type { Content } from '../engine/loader';
import { RendererSystem, toonMat } from '../engine/renderer';
import { buildRig } from './actors/rigs';

/**
 * P0 boot scene: a lit, spinning placeholder Max on a toon platform at 60 fps.
 * Later phases replace this with the full screen flow (title → hub → worlds).
 */
export class Game {
  private rendererSys: RendererSystem;
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, private content: Content) {
    this.rendererSys = new RendererSystem(container);
  }

  start(): void {
    const { scene, camera } = this.rendererSys;
    this.rendererSys.applyPalette({
      skyTop: '#4f9fe8', skyBottom: '#ffd9a8', fog: '#e8c8a0',
      sun: '#fff2d8', ambient: '#bfd8ff',
    });

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 0.6, 24), toonMat('#C8945A'));
    platform.position.y = -0.3;
    platform.receiveShadow = true;
    scene.add(platform);

    const max = buildRig(this.content.characters.max);
    scene.add(max.root);
    this.rendererSys.addOutline(max.root);

    camera.position.set(0, 1.6, 5);
    camera.lookAt(0, 1, 0);

    let t = 0;
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      t += dt;
      max.root.rotation.y += dt * 0.9;
      max.update({ mode: 'idle', speed01: 0 }, t, dt);
      this.rendererSys.render(dt);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
