# Tiny Stack VM

[![make.fun · tiny-stack-vm-01-run-20261122](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)
[![rank](https://make.fun/badge/tiny-stack-vm-01-run-20261122/0xjouje-ai/makefun-tiny-stack-vm-2/rank.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)
[![reward](https://make.fun/badge/tiny-stack-vm-01-run-20261122/0xjouje-ai/makefun-tiny-stack-vm-2/reward.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=tiny-stack-vm-01-run-20261122)

A small interpreter for make.fun's tiny stack ISA: 32-bit wrapping integers, a 256-value data stack, calls, 256 words of memory, input and output, and ten traps with their own exit codes. One run answers a whole set of 40 programs: for each `<id>` it reads `<id>/program.bin` and `<id>/input.bin` and writes `<id>/stdout.bin` and `<id>/exit.txt`.

Run it with Node 22 (standard library only, no dependencies):

```sh
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

It is deterministic: same input, same output, every run.
