import { LmuSharedMemory } from '../../src/main/sim/lmu/lmuSharedMemory'
const shm = new LmuSharedMemory()
console.log('open', shm.open(), 'running', shm.isGameRunning())
