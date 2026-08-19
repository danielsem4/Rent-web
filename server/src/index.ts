import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app';

const app = createApp();
const PORT = process.env['PORT'] || 5001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
