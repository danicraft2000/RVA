// Blocópolis — câmera da cidade (mouse/toque) e modo explorar em primeira pessoa

class CityCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.target = new THREE.Vector3(world.sx / 2, world.waterLevel + 3, world.sz / 2);
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.85;
    this.dist = Math.min(90, world.sx * 0.6);
    this.minDist = 6;
    this.maxDist = Math.max(140, world.sx * 1.3);
    this.groundY = this.target.y;
  }

  apply() {
    const cp = Math.cos(this.pitch);
    const t = this.target;
    this.camera.position.set(
      t.x + this.dist * cp * Math.sin(this.yaw),
      t.y + this.dist * Math.sin(this.pitch),
      t.z + this.dist * cp * Math.cos(this.yaw)
    );
    this.camera.lookAt(t);
  }

  clampTarget() {
    const m = 4;
    this.target.x = clamp(this.target.x, -m, this.world.sx + m);
    this.target.z = clamp(this.target.z, -m, this.world.sz + m);
  }

  panScreen(dx, dy) {
    // desloca no plano do chão, proporcional à distância
    const s = this.dist * 0.0025;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.target.x += (-dx * cos - dy * sin) * s;
    this.target.z += (dx * sin - dy * cos) * s;
    this.clampTarget();
  }

  zoom(factor) {
    this.dist = clamp(this.dist * factor, this.minDist, this.maxDist);
  }

  rotate(dYaw, dPitch) {
    this.yaw += dYaw;
    this.pitch = clamp(this.pitch + dPitch, 0.32, 1.5);
  }

  // Ponto do chão (plano y = target.y) sob a posição da tela
  screenToPlane(nx, ny, planeY, out) {
    const ray = CityCamera._ray || (CityCamera._ray = new THREE.Raycaster());
    ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (planeY - o.y) / d.y;
    if (t < 0) return null;
    return out.set(o.x + d.x * t, planeY, o.z + d.z * t);
  }

  update(dt, keys) {
    const k = keys;
    const speed = this.dist * 1.1 * dt;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (mx || mz) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.target.x += (mx * cos + mz * sin) * speed;
      this.target.z += (-mx * sin + mz * cos) * speed;
      this.clampTarget();
    }
    if (k.has('KeyQ')) this.rotate(-dt * 1.6, 0);
    if (k.has('KeyE')) this.rotate(dt * 1.6, 0);
    if (k.has('KeyT')) this.rotate(0, dt * 0.8);
    if (k.has('KeyG')) this.rotate(0, -dt * 0.8);
    if (k.has('Equal') || k.has('NumpadAdd') || k.has('KeyZ')) this.zoom(1 - dt * 1.5);
    if (k.has('Minus') || k.has('NumpadSubtract') || k.has('KeyX')) this.zoom(1 + dt * 1.5);

    // acompanha a altura do terreno sob o alvo
    const gx = Math.floor(this.target.x), gz = Math.floor(this.target.z);
    const g = this.world.surfaceY(clamp(gx, 0, this.world.sx - 1), clamp(gz, 0, this.world.sz - 1)) + 1;
    this.target.y += (g - this.target.y) * Math.min(1, dt * 3);
    this.apply();
  }
}

// Entrada da visão de cidade: ferramentas com 1 dedo/botão esquerdo, câmera com 2 dedos/botão direito
class CityInput {
  constructor(dom, cam, handler) {
    this.dom = dom;
    this.cam = cam;
    this.h = handler;
    this.pointers = new Map();
    this.state = 'idle';
    this.enabled = true;
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();

    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerup', (e) => this.onUp(e));
    dom.addEventListener('pointercancel', (e) => this.onUp(e, true));
    dom.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.pointers.size) this.h.hoverEnd(); });
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      this.cam.zoom(f);
    }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  ndc(x, y) {
    const r = this.dom.getBoundingClientRect();
    return { x: ((x - r.left) / r.width) * 2 - 1, y: -((y - r.top) / r.height) * 2 + 1 };
  }

  local(e) {
    const r = this.dom.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    if (!this.enabled) return;
    try { this.dom.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = this.local(e);
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), type: e.pointerType, button: e.button });

    if (e.pointerType === 'mouse') {
      if (e.button === 2) this.state = 'rotate';
      else if (e.button === 1) this.state = 'pan';
      else if (this.h.toolWantsPointer('mouse')) { this.state = 'tool'; this.h.toolDown(p.x, p.y, 'mouse'); }
      else this.state = 'pan';
      return;
    }
    if (this.pointers.size === 1) {
      if (this.h.toolWantsPointer('touch')) { this.state = 'tool'; this.h.toolDown(p.x, p.y, 'touch'); }
      else this.state = 'pan';
    } else if (this.pointers.size === 2) {
      if (this.state === 'tool') this.h.toolCancel();
      this.state = 'gesture';
      this.gesture = this.gestureInfo();
    }
  }

  gestureInfo() {
    const [a, b] = [...this.pointers.values()];
    return {
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      ang: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  // Arrasta o mapa mantendo o ponto do chão sob o dedo
  grabPan(px, py, x, y) {
    const a = this.ndc(px + this.dom.getBoundingClientRect().left, py + this.dom.getBoundingClientRect().top);
    const b = this.ndc(x + this.dom.getBoundingClientRect().left, y + this.dom.getBoundingClientRect().top);
    const ty = this.cam.target.y;
    const pa = this.cam.screenToPlane(a.x, a.y, ty, this.tmpA);
    const pb = this.cam.screenToPlane(b.x, b.y, ty, this.tmpB);
    if (!pa || !pb || pa.distanceTo(pb) > this.cam.dist * 2) {
      this.cam.panScreen(x - px, y - py);
      return;
    }
    this.cam.target.x += pa.x - pb.x;
    this.cam.target.z += pa.z - pb.z;
    this.cam.clampTarget();
    this.cam.apply();
  }

  onMove(e) {
    if (!this.enabled) return;
    const p = this.local(e);
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) {
      if (e.pointerType === 'mouse') this.h.hover(p.x, p.y);
      return;
    }
    const px = ptr.x, py = ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    switch (this.state) {
      case 'tool':
        this.h.toolMove(p.x, p.y);
        break;
      case 'pan':
        this.grabPan(px, py, p.x, p.y);
        break;
      case 'rotate':
        this.cam.rotate(-(p.x - px) * 0.006, (p.y - py) * 0.004);
        this.cam.apply();
        break;
      case 'gesture': {
        if (this.pointers.size < 2) break;
        const g = this.gestureInfo();
        const prev = this.gesture;
        this.grabPan(prev.mx, prev.my, g.mx, g.my);
        if (g.dist > 10 && prev.dist > 10) this.cam.zoom(prev.dist / g.dist);
        let da = g.ang - prev.ang;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.cam.rotate(-da, 0);
        this.cam.apply();
        this.gesture = g;
        break;
      }
      default:
        break;
    }
  }

  onUp(e, cancelled = false) {
    const ptr = this.pointers.get(e.pointerId);
    if (!ptr) return;
    this.pointers.delete(e.pointerId);
    const p = this.local(e);
    const moved = Math.hypot(p.x - ptr.sx, p.y - ptr.sy);
    const isTap = !cancelled && moved < 9 && performance.now() - ptr.t < 600;

    if (this.state === 'tool') {
      if (cancelled) this.h.toolCancel();
      else this.h.toolUp(p.x, p.y, isTap, ptr.type);
      this.state = 'idle';
    } else if (this.state === 'pan' && isTap) {
      this.h.tap(p.x, p.y, ptr.type, false);
      this.state = 'idle';
    } else if (this.state === 'rotate' && isTap && ptr.type === 'mouse') {
      this.h.tap(p.x, p.y, 'mouse', true);
      this.state = 'idle';
    } else if (this.state === 'gesture') {
      // ao tirar um dos dedos, o outro continua só movendo a câmera
      if (this.pointers.size === 1) {
        this.state = 'pan-locked';
        const rest = [...this.pointers.values()][0];
        rest.sx = -1e6;
      } else if (!this.pointers.size) this.state = 'idle';
    }
    if (!this.pointers.size) this.state = 'idle';
    else if (this.state === 'pan-locked') this.state = 'pan';
  }

  reset() {
    this.pointers.clear();
    this.state = 'idle';
  }
}

// ---------------------------------------------------------------- primeira pessoa

const PLAYER_HALF = 0.3;
const PLAYER_H = 1.8;
const EYE_H = 1.62;

class FirstPerson {
  constructor(camera, dom, world) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.active = false;
    this.move = { x: 0, z: 0 };
    this.jumpHeld = false;
    this.downHeld = false;
    this.sprint = false;
    this.locked = false;
    this.lastJumpTap = 0;

    this.onMouseMove = (e) => {
      if (!this.active || !this.locked) return;
      this.look(e.movementX * 0.0022, e.movementY * 0.0022);
    };
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  enter(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = -0.15;
    this.active = true;
    this.flying = false;
    this.apply();
  }

  exit() {
    this.active = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  requestLock() {
    if (this.dom.requestPointerLock) {
      try {
        const r = this.dom.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* alguns navegadores não suportam */ }
    }
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.55, 1.55);
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vel.y = 0;
    return this.flying;
  }

  // Dois toques rápidos no pulo ligam/desligam o voo
  tapJump() {
    const now = performance.now();
    const toggled = now - this.lastJumpTap < 300;
    if (toggled) this.toggleFly();
    this.lastJumpTap = toggled ? 0 : now;
    return toggled;
  }

  solidAt(x, y, z) {
    return BLOCK_SOLID[this.world.get(Math.floor(x), Math.floor(y), Math.floor(z))] === 1;
  }

  inWater() {
    return this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z)) === B.WATER;
  }

  collides(px, py, pz) {
    const x0 = Math.floor(px - PLAYER_HALF), x1 = Math.floor(px + PLAYER_HALF - 1e-6);
    const y0 = Math.floor(py), y1 = Math.floor(py + PLAYER_H - 1e-6);
    const z0 = Math.floor(pz - PLAYER_HALF), z1 = Math.floor(pz + PLAYER_HALF - 1e-6);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (BLOCK_SOLID[this.world.get(x, y, z)]) return true;
    return false;
  }

  moveAxis(axis, delta) {
    if (!delta) return false;
    const steps = Math.ceil(Math.abs(delta) / 0.25);
    const d = delta / steps;
    for (let i = 0; i < steps; i++) {
      const p = this.pos;
      const nx = axis === 0 ? p.x + d : p.x, ny = axis === 1 ? p.y + d : p.y, nz = axis === 2 ? p.z + d : p.z;
      if (this.collides(nx, ny, nz)) {
        const ox = p.x, oy = p.y, oz = p.z;
        if (axis === 0) p.x = d > 0 ? Math.floor(p.x + PLAYER_HALF + d) - PLAYER_HALF - 0.001 : Math.floor(p.x - PLAYER_HALF + d) + 1 + PLAYER_HALF + 0.001;
        if (axis === 2) p.z = d > 0 ? Math.floor(p.z + PLAYER_HALF + d) - PLAYER_HALF - 0.001 : Math.floor(p.z - PLAYER_HALF + d) + 1 + PLAYER_HALF + 0.001;
        if (axis === 1) p.y = d > 0 ? Math.floor(p.y + PLAYER_H + d) - PLAYER_H - 0.001 : Math.floor(p.y + d) + 1;
        // segurança: se ainda colide, fica onde estava
        if (this.collides(p.x, p.y, p.z)) p.set(ox, oy, oz);
        return true;
      }
      p.set(nx, ny, nz);
    }
    return false;
  }

  update(dt, keys) {
    if (!this.active) return;
    let mx = this.move.x, mz = this.move.z;
    if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const jump = this.jumpHeld || keys.has('Space');
    const down = this.downHeld || keys.has('ShiftLeft') || keys.has('ShiftRight');
    const sprint = this.sprint || keys.has('ControlLeft');

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const speed = this.flying ? (sprint ? 20 : 11) : (sprint ? 6.5 : 4.4);
    const vx = (mx * cos + mz * sin) * speed;
    const vz = (-mx * sin + mz * cos) * speed;
    const water = this.inWater();

    if (this.flying) {
      this.vel.set(vx, (jump ? 1 : 0) * speed - (down ? 1 : 0) * speed, vz);
    } else {
      this.vel.x = vx * (water ? 0.6 : 1);
      this.vel.z = vz * (water ? 0.6 : 1);
      if (water) {
        this.vel.y = Math.max(this.vel.y - 9 * dt, -3);
        if (jump) this.vel.y = 3.2;
      } else {
        this.vel.y = Math.max(this.vel.y - 26 * dt, -40);
        if (jump && this.onGround) this.vel.y = 8.6;
      }
    }

    const hitX = this.moveAxis(0, this.vel.x * dt);
    const hitZ = this.moveAxis(2, this.vel.z * dt);
    const wasFalling = this.vel.y <= 0;
    const hitY = this.moveAxis(1, this.vel.y * dt);
    this.onGround = hitY && wasFalling;
    if (hitY) this.vel.y = 0;

    // pulo automático em degraus de 1 bloco
    if ((hitX || hitZ) && this.onGround && !this.flying && len > 0.1) {
      const fx = this.pos.x + Math.sign(this.vel.x) * (hitX ? 0.6 : 0);
      const fz = this.pos.z + Math.sign(this.vel.z) * (hitZ ? 0.6 : 0);
      const fy = Math.floor(this.pos.y + 0.01);
      if (this.solidAt(fx, fy, fz) && !this.solidAt(fx, fy + 1, fz) && !this.solidAt(fx, fy + 2, fz)) this.vel.y = 8.6;
    }
    if (this.onGround && this.flying) this.flying = false;

    // não cair para fora do mundo
    if (this.pos.y < -10) this.pos.y = this.world.topY(Math.floor(this.pos.x), Math.floor(this.pos.z)) + 2;
    this.pos.y = Math.min(this.pos.y, WORLD_H + 30);
    this.apply();
  }

  apply() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE_H, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // Direção para onde o jogador olha
  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  intersectsBlock(x, y, z) {
    const p = this.pos;
    return x + 1 > p.x - PLAYER_HALF && x < p.x + PLAYER_HALF &&
      z + 1 > p.z - PLAYER_HALF && z < p.z + PLAYER_HALF &&
      y + 1 > p.y && y < p.y + PLAYER_H;
  }
}
