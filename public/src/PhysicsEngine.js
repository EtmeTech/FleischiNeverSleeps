export class PhysicsEngine {
    constructor() {
        this.obstacles = [];
        this.ramps = [];
        this.isDoorLocked = true;
        this.mode = 'act1'; // 'act1' | 'fleischrooms' | 'school' | 'labyrinth' | 'boiler'
        this.bounds = null;
    }

    addObstacle(minX, maxX, minZ, maxZ, minY = -100, maxY = 100, transform = null) {
        const obs = { minX, maxX, minZ, maxZ, minY, maxY, transform };
        this.obstacles.push(obs);
        return obs;
    }

    removeObstacle(obsRef) {
        if (!obsRef) return;
        const idx = this.obstacles.indexOf(obsRef);
        if (idx !== -1) this.obstacles.splice(idx, 1);
    }

    addRamp(minX, maxX, minZ, maxZ, startY, endY, axis = 'z', transform = null, flatMargin = 0.0) {
        const ramp = { minX, maxX, minZ, maxZ, startY, endY, axis, transform, flatMargin };
        this.ramps.push(ramp);
        return ramp;
    }

    clear() { this.clearObstacles(); }
    addCollider(minX, maxX, minZ, maxZ, minY = -100, maxY = 100) { return this.addObstacle(minX, maxX, minZ, maxZ, minY, maxY); }
    addTrigger() { return null; }

    clearObstacles() {
        this.obstacles = [];
        this.ramps = [];
    }

    setMode(mode, customBounds = null) {
        this.mode = mode;
        this.clearObstacles();
        this.bounds = customBounds;
    }

    lockDoor() {
        this.isDoorLocked = true;
    }

    unlockDoor() {
        this.isDoorLocked = false;
    }

    worldToTransformLocal(wx, wz, transform) {
        const dx = wx - transform.ox;
        const dz = wz - transform.oz;
        const c = Math.cos(transform.rotY);
        const s = Math.sin(transform.rotY);
        return {
            x: dx * c - dz * s,
            z: dx * s + dz * c
        };
    }

    transformLocalToWorld(lx, lz, transform) {
        const c = Math.cos(transform.rotY);
        const s = Math.sin(transform.rotY);
        return {
            x: transform.ox + lx * c + lz * s,
            z: transform.oz - lx * s + lz * c
        };
    }

    getGroundHeight(x, z, footY = 0) {
        if (!this.ramps || this.ramps.length === 0) return 0;

        let bestSlopedY = footY;
        let foundSloped = false;

        let highestFlatY = -999;
        let foundFlat = false;

        for (const r of this.ramps) {
            let lx = x;
            let lz = z;
            if (r.transform) {
                const loc = this.worldToTransformLocal(x, z, r.transform);
                lx = loc.x;
                lz = loc.z;
            }

            if (lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ) {
                const isSloped = Math.abs(r.endY - r.startY) > 0.01;
                let t = 0;
                if (r.axis === 'z') {
                    const span = (r.maxZ - r.minZ) - 2 * (r.flatMargin || 0);
                    t = span > 0.01 ? (lz - (r.minZ + (r.flatMargin || 0))) / span : 0;
                } else if (r.axis === 'x') {
                    const span = (r.maxX - r.minX) - 2 * (r.flatMargin || 0);
                    t = span > 0.01 ? (lx - (r.minX + (r.flatMargin || 0))) / span : 0;
                }
                t = Math.max(0, Math.min(1, t));
                const ry = r.startY + t * (r.endY - r.startY);

                if (isSloped) {
                    if (ry <= footY + 2.0 && ry >= footY - 2.4) {
                        if (!foundSloped || Math.abs(ry - footY) < Math.abs(bestSlopedY - footY)) {
                            bestSlopedY = ry;
                            foundSloped = true;
                        }
                    }
                } else {
                    // Für Kisten, Rohre und Böden: Wähle die höchste Plattform unter/an den Füßen (<= footY + 0.45m)!
                    if (ry <= footY + 0.45 && ry >= footY - 3.5) {
                        if (!foundFlat || ry > highestFlatY) {
                            highestFlatY = ry;
                            foundFlat = true;
                        }
                    }
                }
            }
        }

        if (foundSloped) return bestSlopedY;
        if (foundFlat) return highestFlatY;
        return 0;
    }

    resolveMovement(currentPos, nextPos, radius = 0.35, currentGroundY = 0) {
        const resolved = nextPos.clone();

        if (this.mode === 'act1') {
            const inBedroom = resolved.z > 0.0;
            const inHallway = resolved.z <= 0.0;

            if (inBedroom) {
                resolved.x = Math.max(-2.15, Math.min(2.15, resolved.x));
                resolved.z = Math.min(3.7, resolved.z);

                if (this.isDoorLocked) {
                    if (resolved.z < 0.35) {
                        resolved.z = 0.35;
                    }
                } else {
                    if (resolved.z < 0.15 && (resolved.x < -0.55 || resolved.x > 0.55)) {
                        resolved.z = 0.15;
                    }
                }
            } else if (inHallway) {
                resolved.x = Math.max(-1.05, Math.min(1.05, resolved.x));
                resolved.z = Math.max(-52.5, Math.min(0.1, resolved.z));
            }
        } else if (this.bounds) {
            resolved.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, resolved.x));
            resolved.z = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, resolved.z));
        }

        for (const obs of this.obstacles) {
            const minY = obs.minY !== undefined ? obs.minY : -100;
            const maxY = obs.maxY !== undefined ? obs.maxY : 100;
            if (currentGroundY + 1.35 < minY || currentGroundY + 0.3 > maxY) continue;

            if (obs.transform) {
                const curLoc = this.worldToTransformLocal(currentPos.x, currentPos.z, obs.transform);
                const resLoc = this.worldToTransformLocal(resolved.x, resolved.z, obs.transform);

                if (
                    resLoc.x + radius > obs.minX &&
                    resLoc.x - radius < obs.maxX &&
                    resLoc.z + radius > obs.minZ &&
                    resLoc.z - radius < obs.maxZ
                ) {
                    if (curLoc.x + radius <= obs.minX || curLoc.x - radius >= obs.maxX) {
                        resLoc.x = curLoc.x;
                    }
                    if (curLoc.z + radius <= obs.minZ || curLoc.z - radius >= obs.maxZ) {
                        resLoc.z = curLoc.z;
                    }
                    const backWorld = this.transformLocalToWorld(resLoc.x, resLoc.z, obs.transform);
                    resolved.x = backWorld.x;
                    resolved.z = backWorld.z;
                }
            } else {
                if (
                    resolved.x + radius > obs.minX &&
                    resolved.x - radius < obs.maxX &&
                    resolved.z + radius > obs.minZ &&
                    resolved.z - radius < obs.maxZ
                ) {
                    if (currentPos.x + radius <= obs.minX || currentPos.x - radius >= obs.maxX) {
                        resolved.x = currentPos.x;
                    }
                    if (currentPos.z + radius <= obs.minZ || currentPos.z - radius >= obs.maxZ) {
                        resolved.z = currentPos.z;
                    }
                }
            }
        }

        return resolved;
    }
}
