#!/usr/bin/env bun
import { bootstrapCli } from './ops';

await bootstrapCli(Bun.argv.slice(2));
