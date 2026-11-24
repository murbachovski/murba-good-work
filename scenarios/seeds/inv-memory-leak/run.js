import { handleRequest, stats } from './src/service.js';

for (let i = 1; i <= 100000; i++) {
  handleRequest(i % 50, i);
  if (i % 20000 === 0) {
    global.gc?.();
    console.log(i, 'heapMB', Math.round(process.memoryUsage().heapUsed / 1e6), stats());
  }
}
