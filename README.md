# YAiRO — Yet Another iRacing Overlay

Simple, lightweight overlays for iRacing.
All overlays are also available to use in a browser or as an OBS browser source.

No cloud, everything free, everything open-source.

## Features

### 🏁 Standings
![standings.png](media/standings.png)

#### ⚠️ Stint Laps
iRacing does not provide this info. It is calculated internally from tracked laps. 
But when the program is not running (e.g. in 24hr races when you turn off your pc) and in the meantime the car pits, 
it is not tracked and the stint laps will continue to rise when you reconnect and start YAiRO.

### 📊 Relative
![relative.png](media/relative.png)

#### ⚠️ Stint Laps
iRacing does not provide this info. It is calculated internally from tracked laps.
But when the program is not running (e.g. in 24hr races when you turn off your pc) and in the meantime the car pits,
it is not tracked and the stint laps will continue to rise when you reconnect and start YAiRO.

### 🏎️ Telemetry
![telemetry.png](media/telemetry.png)

### ⛽ Fuel
WIP

### ⏱️ Lap Timer
![lap-timer.png](media/lap-timer.png)

### ❌ Incidents
WIP

### 🗺️ Trackmap
WIP

### 🛞 Tires
![tires.png](media/tires.png)

### 🏁 Flags
![flags.png](media/flags.png)

## Planned features

- **More Overlays** - Weather, Flags, Radar (as far as possible), Delta bar, ...
- **More Games** - Assetto Corsa Games, Le Mans Ultimate, ...
- **Broadcast Overlays** - Overlays more focused on design to use in livestreams
- **Customizability** - Choose colors, fonts, reorder columns, ...

## Requirements

- Windows
- [iRacing](https://www.iracing.com)
- For Development: Node.js 18+

## Development and Build (WIP)

```bash
npm install
npm run dev
```

Build `.exe`:

```bash
npm run build:win
```
