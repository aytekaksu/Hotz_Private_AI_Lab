#!/usr/bin/env bun
import { deployCli } from './ops';

await deployCli(Bun.argv.slice(2));
