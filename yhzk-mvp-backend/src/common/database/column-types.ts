import { ColumnType } from 'typeorm';

export const portableDateColumnType: ColumnType =
  process.env.DB_LIGHTWEIGHT === 'true' || process.env.NODE_ENV === 'test'
    ? 'datetime'
    : 'timestamp';
