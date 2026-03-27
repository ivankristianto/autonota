#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program
  .name("nota")
  .description("Download YouTube audio, transcribe it, and summarize transcripts");

program.parse();
