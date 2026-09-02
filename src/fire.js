// 무너진 집은 새벽까지 탄다. 불꽃 빌보드(스팟 레이어, 호박→붉음) + 바닥 발광 원반. 실광원은 공유 1개만(가장 최근 화재를 따라간다).
import * as THREE from 'three';
import { LAYER_SPOT } from './look.js';

const MAX_FIRES = 8;

function flameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,200,120,1)'); grad.addColorStop(0.45, 'rgba(255,120,40,0.9)'); grad.addColorStop(0.8, 'rgba(200,30,20,0.5)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(32, 0); g.bezierCurveTo(62, 60, 60, 128, 32, 128); g.bezierCurveTo(4, 128, 2, 60, 32, 0); g.fill();
  return new THREE.CanvasTexture(c);
}

export function createFires(scene) {
  const tex = flameTexture();
  const fires = [];
  const light = new THREE.PointLight(0xff8a3c, 0, 26, 1.8); scene.add(light);
  let t = 0;

  function ignite(x, z, radius) {
    if (fires.length >= MAX_FIRES) { const old = fires.shift(); old.group.removeFromParent(); }
    const group = new THREE.Group(); group.position.set(x, 0, z); scene.add(group);
    const flames = [];
    const n = Math.round(6 + radius * 1.2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius * 0.7;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, rotation: 0 }));
      s.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); s.layers.set(LAYER_SPOT); s.center.set(0.5, 0.05);
      const h = 2.2 + Math.random() * 2.6;
      group.add(s); flames.push({ s, h, phase: Math.random() * 7, speed: 2.5 + Math.random() * 2 });
    }
    // 세계 패스용 바닥 발광(흑백으로 밝아진다) + 스팟 패스용 호박 원반
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; group.add(disc);
    const spotDisc = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 20), new THREE.MeshBasicMaterial({ color: 0x8a3a10, transparent: true, opacity: 0.6, depthWrite: false }));
    spotDisc.rotation.x = -Math.PI / 2; spotDisc.position.y = 0.06; spotDisc.layers.set(LAYER_SPOT); group.add(spotDisc);
    fires.push({ group, flames, disc, spotDisc, x, z, born: t });
    light.position.set(x, 3.5, z);
  }

  function update(dt) {
    t += dt;
    for (const f of fires) {
      for (const fl of f.flames) {
        const k = 0.75 + 0.25 * Math.sin(t * fl.speed + fl.phase) + 0.12 * Math.sin(t * fl.speed * 2.7 + fl.phase * 3);
        fl.s.scale.set(fl.h * 0.45 * k, fl.h * k, 1);
        fl.s.material.rotation = Math.sin(t * 1.3 + fl.phase) * 0.12;
      }
      const g = 0.3 + 0.08 * Math.sin(t * 3.1 + f.x);
      f.disc.material.opacity = g; f.spotDisc.material.opacity = g * 1.6;
    }
    const last = fires[fires.length - 1];
    light.intensity = last ? 70 * (0.85 + 0.15 * Math.sin(t * 5.3)) : 0;
  }

  return { ignite, update, fires };
}
