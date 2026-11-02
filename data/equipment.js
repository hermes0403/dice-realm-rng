export const POTIONS=[
{id:'luck1',name:'運氣藥水 I',icon:'🧪',luck:10,duration:300000,cost:300,recipe:[['d5',2]],desc:'運氣 +10%，持續 5 分鐘。'},
{id:'luck2',name:'運氣藥水 II',icon:'⚗️',luck:20,duration:300000,cost:2500,recipe:[['d7',2],['d9',1]],desc:'運氣 +20%，持續 5 分鐘。'},
{id:'luck3',name:'運氣藥水 III',icon:'✦',luck:33,duration:300000,cost:15000,recipe:[['d11',2],['d14',1]],desc:'運氣 +33%，持續 5 分鐘。'},
{id:'speed1',name:'速度藥水 I',icon:'💨',speed:10,duration:300000,cost:350,recipe:[['d7',2]],desc:'擲骰速度 +10%，持續 5 分鐘。'},
{id:'speed2',name:'速度藥水 II',icon:'🌪️',speed:20,duration:300000,cost:2000,recipe:[['d9',2],['d8',1]],desc:'擲骰速度 +20%，持續 5 分鐘。'},
{id:'angel1',name:'天堂藥水 I',icon:'🪽',luck:0,duration:0,cost:75000,recipe:[['d16',2],['d17',1]],desc:'大幅提升下一抽的機率'},
{id:'angel2',name:'天堂藥水 II',icon:'🌌',luck:0,duration:0,cost:0,recipe:[['potion:angel1',1],['potion:luck2',10],['d18',1]],desc:'更大幅度提升下一抽的機率'}
];
export const ANGEL_ODDS=[
 ['d11',33],['d28',28],['d12',16],['d13',9.9],['d14',5.99],['d15',3.5],
 ['d16',1.8],['d17',0.9],['d18',0.45],['d19',0.2],['d29',0.1],['d30',0.01],
 ['d20',0.08],['d21',0.04],['d22',0.015],['d23',0.008],['d25',0.004],
 ['d26',0.0015],['d31',0.0007],['d24',0.0005],['d27',0.0002],['d32',0.0001]
];
// 當前天氣中，每顆分母 > 2048 的限定骰子各獲得 1% 機率。
// 這些機率從原本大於 10% 的項目按比例扣除，不會讓總機率超過 100%。
