import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

const queryClient = postgres(config.database.url);
export const db = drizzle(queryClient, { schema });
