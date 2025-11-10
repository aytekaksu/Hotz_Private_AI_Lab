#!/usr/bin/env bun
import { restoreCli } from './ops';

await restoreCli(Bun.argv.slice(2));
