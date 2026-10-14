import { createContext } from 'react'
import { DEFAULT_SIMULATOR, type SimulatorId } from '../../../shared/types'

export const SimulatorContext = createContext<SimulatorId>(DEFAULT_SIMULATOR)
