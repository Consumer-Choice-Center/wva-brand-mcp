#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createBrandMcpServer} from './mcp-factory.mjs';
await createBrandMcpServer().connect(new StdioServerTransport());
