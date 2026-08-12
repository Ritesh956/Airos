import { ModulePlaceholder } from '@/ui/ModulePlaceholder';
import { GameIcon } from '@/ui/icons';

export default function GameModule() {
  return (
    <ModulePlaceholder
      label="Game Mode"
      phase={12}
      icon={<GameIcon className="h-6 w-6" />}
      description="A small, polished arcade game proving the tracking pipeline is fast and precise enough to actually play with."
      willInclude={[
        'A spaceship controlled by index-finger position — horizontal movement mapped 1:1',
        'Pinch to fire, open palm to raise a shield',
        'Kept deliberately simple: the interaction quality is the point, not the game design',
      ]}
    />
  );
}
