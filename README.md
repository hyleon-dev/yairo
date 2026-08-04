# YAiRO — Yet Another iRacing Overlay

Simple, lightweight overlays for iRacing.
All overlays are also available to use in a browser or as an OBS browser source.

No cloud, everything free, everything open-source.

## Features

### 🥇 Standings
![standings.png](media/standings.png)
- Session info
- Multi-Class support
- Choose top cars to be displayed
- Choose cars around you to be displayed
- Car info:
  - Class-position
  - Number
  - Name
  - iRating and Safety Rating (can also be hidden)
  - Lap of cars
  - [Stint laps¹](#-stint-laps)
  - Gap to leader
  - Best lap

### ↔️ Relative
![relative.png](media/relative.png)
- Multi-Class support
- Choose cars around you to be displayed
- Car info:
  - Class-position
  - Number
  - Name
  - iRating and Safety Rating (can also be hidden)
  - Lap of cars
  - [Stint laps¹](#-stint-laps)
  - Gap to you

### 📊 Telemetry
![telemetry.png](media/telemetry.png)
- Rev bar
- RPM as number (can also be hidden)
- Input bars for clutch, brake and throttle
- Speed
- Gear

### ⛽ Fuel
TODO document

### ⏱️ Lap Timer
![lap-timer.png](media/lap-timer.png)
- Current lap
- Current lap time
- Last lap time
- Best lap time
- Estimated Laps
- Incidents

### ❌ Incidents
TODO document

### 🗺️ Trackmap
![trackmap.png](media/trackmap.png)
- Multi-Class support
- Cars on track
- Cars in pit
- Start/Finish line
- Track direction

### 🛞 Tires
![tires.png](media/tires.png)
- Tire wear
  - as graphic and number (can be hidden)
- Tire temperature

### 🏁 Flags
![flags.png](media/flags.png)
- Flags:
  - Black flag
  - Meatball flag
  - Red flag
  - Checkered flag
  - Blue flag
  - Yellow flag
  - Red-Yellow (caution) flag
  - White flag
  - Green flag

### 🎨 Custom accent color
TODO document

## Notes

### ⚠️ Stint Laps
iRacing does not provide this info. It is calculated internally from tracked laps.
But when the program is not running (e.g. in 24hr races when you turn off your pc) and in the meantime the car pits,
it is not tracked and the stint laps will continue to rise when you reconnect and start YAiRO.

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
