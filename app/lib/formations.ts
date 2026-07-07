/** Formation slot presets — normalised (y:1 = own goal, y:0 = attacking end). Used by the
 *  squad token board + the match-plan formation overlays (ours + opposition). */
export interface FSlot { pos: string; x: number; y: number }

export const FORMATIONS: Record<string, FSlot[]> = {
  '4-3-3': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'LB', x: .15, y: .74 }, { pos: 'CB', x: .38, y: .77 }, { pos: 'CB', x: .62, y: .77 }, { pos: 'RB', x: .85, y: .74 },
    { pos: 'CM', x: .3, y: .52 }, { pos: 'CM', x: .5, y: .55 }, { pos: 'CM', x: .7, y: .52 },
    { pos: 'LW', x: .2, y: .25 }, { pos: 'ST', x: .5, y: .2 }, { pos: 'RW', x: .8, y: .25 },
  ],
  '4-4-2': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'LB', x: .15, y: .74 }, { pos: 'CB', x: .38, y: .77 }, { pos: 'CB', x: .62, y: .77 }, { pos: 'RB', x: .85, y: .74 },
    { pos: 'LM', x: .15, y: .5 }, { pos: 'CM', x: .38, y: .52 }, { pos: 'CM', x: .62, y: .52 }, { pos: 'RM', x: .85, y: .5 },
    { pos: 'ST', x: .38, y: .22 }, { pos: 'ST', x: .62, y: .22 },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'LB', x: .15, y: .76 }, { pos: 'CB', x: .38, y: .78 }, { pos: 'CB', x: .62, y: .78 }, { pos: 'RB', x: .85, y: .76 },
    { pos: 'DM', x: .38, y: .58 }, { pos: 'DM', x: .62, y: .58 },
    { pos: 'LAM', x: .22, y: .38 }, { pos: 'CAM', x: .5, y: .35 }, { pos: 'RAM', x: .78, y: .38 },
    { pos: 'ST', x: .5, y: .18 },
  ],
  '3-5-2': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'CB', x: .3, y: .78 }, { pos: 'CB', x: .5, y: .8 }, { pos: 'CB', x: .7, y: .78 },
    { pos: 'LWB', x: .12, y: .55 }, { pos: 'CM', x: .35, y: .52 }, { pos: 'CM', x: .5, y: .55 }, { pos: 'CM', x: .65, y: .52 }, { pos: 'RWB', x: .88, y: .55 },
    { pos: 'ST', x: .38, y: .22 }, { pos: 'ST', x: .62, y: .22 },
  ],
  '3-4-3': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'CB', x: .3, y: .78 }, { pos: 'CB', x: .5, y: .8 }, { pos: 'CB', x: .7, y: .78 },
    { pos: 'LM', x: .15, y: .52 }, { pos: 'CM', x: .4, y: .54 }, { pos: 'CM', x: .6, y: .54 }, { pos: 'RM', x: .85, y: .52 },
    { pos: 'LW', x: .22, y: .24 }, { pos: 'ST', x: .5, y: .2 }, { pos: 'RW', x: .78, y: .24 },
  ],
  '4-1-4-1': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'LB', x: .15, y: .76 }, { pos: 'CB', x: .38, y: .78 }, { pos: 'CB', x: .62, y: .78 }, { pos: 'RB', x: .85, y: .76 },
    { pos: 'DM', x: .5, y: .6 },
    { pos: 'LM', x: .15, y: .42 }, { pos: 'CM', x: .38, y: .44 }, { pos: 'CM', x: .62, y: .44 }, { pos: 'RM', x: .85, y: .42 },
    { pos: 'ST', x: .5, y: .2 },
  ],
  '5-3-2': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'LWB', x: .1, y: .68 }, { pos: 'CB', x: .3, y: .78 }, { pos: 'CB', x: .5, y: .8 }, { pos: 'CB', x: .7, y: .78 }, { pos: 'RWB', x: .9, y: .68 },
    { pos: 'CM', x: .32, y: .5 }, { pos: 'CM', x: .5, y: .52 }, { pos: 'CM', x: .68, y: .5 },
    { pos: 'ST', x: .38, y: .22 }, { pos: 'ST', x: .62, y: .22 },
  ],
  '4-5-1': [
    { pos: 'GK', x: .5, y: .93 },
    { pos: 'LB', x: .15, y: .76 }, { pos: 'CB', x: .38, y: .78 }, { pos: 'CB', x: .62, y: .78 }, { pos: 'RB', x: .85, y: .76 },
    { pos: 'LM', x: .12, y: .48 }, { pos: 'CM', x: .34, y: .52 }, { pos: 'CM', x: .5, y: .54 }, { pos: 'CM', x: .66, y: .52 }, { pos: 'RM', x: .88, y: .48 },
    { pos: 'ST', x: .5, y: .2 },
  ],
};

export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const formationSlots = (f: string): FSlot[] => FORMATIONS[f] || FORMATIONS['4-3-3'];
