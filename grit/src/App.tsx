import { useEffect } from 'react'
import { GameProvider, useGame } from './state/store'
import { Profiles } from './screens/Profiles'
import { Yard } from './screens/Yard'
import { LoadBay } from './screens/LoadBay'
import { Predict } from './screens/Predict'
import { DriveScreen } from './screens/DriveScreen'
import { Results } from './screens/Results'
import { Shop } from './screens/Shop'
import { GrownUps } from './screens/GrownUps'
import { FreePlayBay } from './screens/FreePlayBay'
import { RotateNudge } from './components/ui'
import { MeterLab } from './MeterLab'

export function App() {
  // A bench for the grip meter, used while building it. Not linked from anywhere.
  if (new URLSearchParams(window.location.search).get('lab') === 'meter') {
    return <MeterLab />
  }
  return (
    <GameProvider>
      <Game />
    </GameProvider>
  )
}

function Game() {
  const { screen, profile, reducedMotion } = useGame()

  useEffect(() => {
    document.documentElement.classList.toggle('no-motion', reducedMotion)
  }, [reducedMotion])

  if (!profile) return <Shell><Profiles /></Shell>

  switch (screen.k) {
    case 'profiles':
      return <Shell><Profiles /></Shell>
    case 'yard':
      return <Shell><Yard /></Shell>
    case 'shop':
      return <Shell><Shop /></Shell>
    case 'grownup':
      return <Shell><GrownUps /></Shell>
    case 'loadbay':
      return (
        <Shell>
          {screen.levelId === 'free' ? (
            <FreePlayBay />
          ) : (
            <LoadBay levelId={screen.levelId} runIndex={screen.runIndex} carried={screen.carried} />
          )}
        </Shell>
      )
    case 'predict':
      return (
        <Shell>
          <Predict
            levelId={screen.levelId}
            runIndex={screen.runIndex}
            placement={screen.placement}
            carried={screen.carried}
          />
        </Shell>
      )
    case 'drive':
      return (
        <Shell>
          <DriveScreen
            levelId={screen.levelId}
            runIndex={screen.runIndex}
            placement={screen.placement}
            predictionCorrect={screen.predictionCorrect}
            carried={screen.carried}
          />
        </Shell>
      )
    case 'results':
      return (
        <Shell>
          <Results
            levelId={screen.levelId}
            awards={screen.awards}
            succeeded={screen.succeeded}
            nextRun={screen.nextRun}
          />
        </Shell>
      )
    default:
      return <Shell><Yard /></Shell>
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full">
      {children}
      <RotateNudge />
    </div>
  )
}
