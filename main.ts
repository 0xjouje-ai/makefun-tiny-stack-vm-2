// Tiny stack VM: runs every program in MAKEFUN_INPUT_DIR and writes
// stdout.bin + exit.txt per instance to MAKEFUN_OUTPUT_DIR. Node 22,
// standard library only, no network, no clock.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Opcode facts, five characters per opcode: two hex digits for the byte,
// then immediate bytes, values popped, values pushed. A byte missing
// here is an unknown opcode (trap 5).
const T = '0000001101024010301004012050220602307033100211102112021130211402115021160211701118021190211a0211b0111c0211d0211e0212002121021220213020031210322103320034000400114102050010510105200153010';
const imm = new Uint8Array(256), pops = new Uint8Array(256), push = new Uint8Array(256), known = new Uint8Array(256);
for (let i = 0; i < T.length; i += 5) {
  const o = parseInt(T.slice(i, i + 2), 16);
  known[o] = 1; imm[o] = +T[i + 2]; pops[o] = +T[i + 3]; push[o] = +T[i + 4];
}

const enc = new TextEncoder();

// Runs one program on its input bytes. Returns the bytes it wrote and
// the exit code it ended with (a trap's code, or 0 / EXIT's low byte).
function run(prog, input) {
  const n = prog.length;
  const d = new Int32Array(256);
  let sp = 0;
  const c = new Int32Array(64);
  let cp = 0;
  const m = new Int32Array(256);
  const out = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const end = (exit) => ({ out: out.subarray(0, ol), exit });
  for (;;) {
    if (steps === 1000000) return end(10);
    if (pc < 0 || pc >= n) return end(9);
    const op = prog[pc];
    if (!known[op]) return end(5);
    const im = imm[op];
    if (pc + im >= n) return end(9);
    steps++;
    const nx = pc + 1 + im;
    const p = pops[op];
    if (sp < p) return end(2);
    if (sp - p + push[op] > 256) return end(3);
    pc = nx;
    switch (op) {
      case 0x00: return end(0);
      case 0x01: d[sp++] = (prog[nx - 1] << 24) >> 24; break;
      case 0x02: d[sp++] = prog[nx - 4] | (prog[nx - 3] << 8) | (prog[nx - 2] << 16) | (prog[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: d[sp] = d[sp - 1]; sp++; break;
      case 0x05: { const t = d[sp - 1]; d[sp - 1] = d[sp - 2]; d[sp - 2] = t; break; }
      case 0x06: d[sp] = d[sp - 2]; sp++; break;
      case 0x07: { const a = d[sp - 3]; d[sp - 3] = d[sp - 2]; d[sp - 2] = d[sp - 1]; d[sp - 1] = a; break; }
      case 0x17: d[sp - 1] = -d[sp - 1] | 0; break;
      case 0x1b: d[sp - 1] = ~d[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = d[sp - 1];
        const a = d[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return end(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return end(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return end(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return end(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        d[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((prog[nx - 2] | (prog[nx - 1] << 8)) << 16) >> 16;
        if (op === 0x30) pc = nx + rel;
        else {
          const v = d[--sp];
          if (op === 0x31 ? v === 0 : v !== 0) pc = nx + rel;
        }
        break;
      }
      case 0x33:
        if (cp === 64) return end(7);
        c[cp++] = nx;
        pc = prog[nx - 2] | (prog[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return end(8);
        pc = c[--cp];
        break;
      case 0x40: {
        const addr = d[sp - 1];
        if (addr < 0 || addr >= 256) return end(6);
        d[sp - 1] = m[addr];
        break;
      }
      case 0x41: {
        const addr = d[sp - 1];
        if (addr < 0 || addr >= 256) return end(6);
        m[addr] = d[sp - 2];
        sp -= 2;
        break;
      }
      case 0x50: {
        const bytes = enc.encode(String(d[sp - 1]));
        if (ol + bytes.length > 65536) return end(11);
        sp--;
        out.set(bytes, ol);
        ol += bytes.length;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return end(11);
        out[ol++] = d[--sp] & 255;
        break;
      case 0x52: d[sp++] = ip < input.length ? input[ip++] : -1; break;
      case 0x53: return end(d[--sp] & 255);
    }
  }
}

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(IN_DIR).sort()) {
  const prog = readFileSync(join(IN_DIR, id, 'program.bin'));
  const input = readFileSync(join(IN_DIR, id, 'input.bin'));
  const r = run(prog, input);
  mkdirSync(join(OUT_DIR, id), { recursive: true });
  writeFileSync(join(OUT_DIR, id, 'stdout.bin'), r.out);
  writeFileSync(join(OUT_DIR, id, 'exit.txt'), String(r.exit) + '\n');
}
