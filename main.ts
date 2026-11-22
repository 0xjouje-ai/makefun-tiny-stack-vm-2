// Faithful interpreter of the kit ISA (generator/subject/ISA.md): exact 32-bit wrapping,
// every trap with its own exit code, step and output limits. Node 22, no dependencies.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Per-opcode tables, indexed by opcode byte: immediate length, pops, pushes, known flag.
const IM = new Uint8Array(256), PO = new Uint8Array(256), PU = new Uint8Array(256), KN = new Uint8Array(256);
for (const [o, i, p, s] of [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2], [5, 0, 2, 2],
  [6, 0, 2, 3], [7, 0, 3, 3], [0x17, 0, 1, 1], [0x1b, 0, 1, 1], [0x30, 2, 0, 0],
  [0x31, 2, 1, 0], [0x32, 2, 1, 0], [0x33, 2, 0, 0], [0x34, 0, 0, 0], [0x40, 0, 1, 1],
  [0x41, 0, 2, 0], [0x50, 0, 1, 0], [0x51, 0, 1, 0], [0x52, 0, 0, 1], [0x53, 0, 1, 0],
]) { IM[o] = i; PO[o] = p; PU[o] = s; KN[o] = 1; }
for (const o of [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x20, 0x21, 0x22]) {
  PO[o] = 2; PU[o] = 1; KN[o] = 1;
}

function run(p, q) {
  const n = p.length;
  // Decode each address once: opcode (or -1 unknown / -2 immediate cut off), immediate value, next pc.
  const K = new Int32Array(n), V = new Int32Array(n), N = new Int32Array(n);
  for (let a = 0; a < n; a++) {
    const o = p[a];
    if (!KN[o]) { K[a] = -1; continue; } // unknown opcode -> trap 5
    const m = IM[o];
    if (a + m >= n) { K[a] = -2; continue; } // immediate cut off -> trap 9
    K[a] = o; N[a] = a + 1 + m;
    if (m === 1) V[a] = (p[a + 1] << 24) >> 24; // PUSH8: sign-extended
    else if (m === 4) V[a] = p[a + 1] | (p[a + 2] << 8) | (p[a + 3] << 16) | (p[a + 4] << 24);
    else if (m === 2) { const u = p[a + 1] | (p[a + 2] << 8); V[a] = o === 0x33 ? u : ((u << 16) >> 16); }
  }
  const D = new Int32Array(256), C = new Int32Array(64), M = new Int32Array(256), out = new Uint8Array(65536);
  let sp = 0, cp = 0, ol = 0, ip = 0, pc = 0, st = 0;
  const done = (c) => ({ out: out.slice(0, ol), code: c });
  for (;;) {
    if (st === 1000000) return done(10);
    if (pc < 0 || pc >= n) return done(9);
    const o = K[pc];
    if (o < 0) return done(o === -1 ? 5 : 9);
    st++;
    if (sp < PO[o]) return done(2);
    if (sp - PO[o] + PU[o] > 256) return done(3);
    const c = pc; pc = N[c]; const v = V[c];
    switch (o) {
      case 0: return done(0);
      case 1: case 2: D[sp++] = v; break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = (-D[sp - 1]) | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = D[sp - 1], a = D[sp - 2];
        let r;
        if (o === 0x10) r = (a + b) | 0;
        else if (o === 0x11) r = (a - b) | 0;
        else if (o === 0x12) r = Math.imul(a, b);
        else if (o === 0x13) { if (!b) return done(4); r = a === -2147483648 && b === -1 ? a : (a / b) | 0; }
        else if (o === 0x14) { if (!b) return done(4); r = b === -1 ? 0 : (a % b) | 0; }
        else if (o === 0x15) { if (!b) return done(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (o === 0x16) { if (!b) return done(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (o === 0x18) r = a & b;
        else if (o === 0x19) r = a | b;
        else if (o === 0x1a) r = a ^ b;
        else if (o === 0x1c) r = a << (b & 31);
        else if (o === 0x1d) r = a >> (b & 31);
        else if (o === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (o === 0x20) r = a === b ? 1 : 0;
        else if (o === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r; break;
      }
      case 0x30: pc += v; break;
      case 0x31: if (D[--sp] === 0) pc += v; break;
      case 0x32: if (D[--sp] !== 0) pc += v; break;
      case 0x33: if (cp === 64) return done(7); C[cp++] = pc; pc = v; break;
      case 0x34: if (!cp) return done(8); pc = C[--cp]; break;
      case 0x40: { const a = D[sp - 1]; if (a < 0 || a > 255) return done(6); D[sp - 1] = M[a]; break; }
      case 0x41: { const a = D[sp - 1], w = D[sp - 2]; if (a < 0 || a > 255) return done(6); sp -= 2; M[a] = w; break; }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (ol + s.length > 65536) return done(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[ol++] = s.charCodeAt(i);
        break;
      }
      case 0x51: if (ol + 1 > 65536) return done(11); out[ol++] = D[--sp] & 255; break;
      case 0x52: D[sp++] = ip < q.length ? q[ip++] : -1; break;
      case 0x53: return done(D[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  let p = new Uint8Array(0), q = new Uint8Array(0);
  try { p = readFileSync(join(I, id, 'program.bin')); q = readFileSync(join(I, id, 'input.bin')); } catch { /* missing files: empty program traps 9, still answered */ }
  const r = run(p, q);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
