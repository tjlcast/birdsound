import { BirdInfo } from '../types';

export const BIRD_DATASET: Record<string, BirdInfo> = {
  'labcro1': {
    id: 'labcro1',
    nameCn: '大嘴乌鸦(mock)',
    nameEn: 'Large-billed Crow(mock)',
    scientificName: 'Corvus macrorhynchos(mock)',
    description: '(mock)大嘴乌鸦是一种中型乌鸦，体羽全黑。它们非常聪明，具有极强的环境适应能力。鸣声粗犷且音量大，常伴有沙哑的余音。在东亚森林和城市景观中非常常见。',
    tags: ['留鸟', '杂食', '高智商', '城市常见'],
    image: 'https://picsum.photos/seed/crow/400/300'
  },
  'pycsin1': {
    id: 'pycsin1',
    nameCn: '白头鹎(mock)',
    nameEn: 'Light-vented Bulbul(mock)',
    scientificName: 'Pycnonotus sinensis(mock)',
    description: '(mock)又名白头翁。额至头顶黑色，两眼上方至后枕白色。性活泼，不甚怕人。鸣声清脆婉转，是华东和华南地区最常见的庭园鸣禽之一。',
    tags: ['分布广泛', '鸣声婉转', '群居'],
    image: 'https://picsum.photos/seed/bulbul/400/300'
  },
  'chigro1': {
    id: 'chigro1',
    nameCn: '黑尾蜡嘴雀(mock)',
    nameEn: 'Chinese Grosbeak(mock)',
    scientificName: 'Eophona migratoria(mock)',
    description: '(mock)中型雀类，具有粗大的黄色喙。雄鸟头部全黑，尾巴黑色带金属光泽。鸣声嘹亮悦耳，常在树冠层活动。',
    tags: ['黄色大喙', '鸣声悦耳', '候鸟'],
    image: 'https://picsum.photos/seed/grosbeak/400/300'
  },
  'vinpar1': {
    id: 'vinpar1',
    nameCn: '棕头鸦雀(mock)',
    nameEn: 'Vinous-throated Parrotbill(mock)',
    scientificName: 'Sinosuthora webbiana(mock)',
    description: '(mock)体型极小的褐色鸟类，具有像鹦鹉一样的厚喙。常结成吵闹的小群在灌木丛中穿梭。鸣音急促细碎。',
    tags: ['娇小', '吵闹', '灌木丛'],
    image: 'https://picsum.photos/seed/parrotbill/400/300'
  },
  'chihwa1': {
    id: 'chihwa1',
    nameCn: '画眉(mock)',
    nameEn: 'Chinese Hwamei(mock)',
    scientificName: 'Garrulax canorus(mock)',
    description: '(mock)具有标志性的白色眼圈和向后延伸的眉纹。叫声极富变化，婉转悦耳，是山林中的"歌唱家"。',
    tags: ['白色眉纹', '擅长鸣啭', '山林鸟类'],
    image: 'https://picsum.photos/seed/hwamei/400/300'
  },
  'oriold1': {
    id: 'oriold1',
    nameCn: '黑枕黄鹂(mock)',
    nameEn: 'Black-naped Oriole(mock)',
    scientificName: 'Oriolus chinensis(mock)',
    description: '(mock)全身金黄色的美丽鸟类，过眼纹为黑色。鸣声清脆如笛，如流水般流畅。',
    tags: ['金黄色', '笛声', '林缘'],
    image: 'https://picsum.photos/seed/oriole/400/300'
  },
  'cinspa1': {
    id: 'cinspa1',
    nameCn: '山麻雀(mock)',
    nameEn: 'Russet Sparrow(mock)',
    scientificName: 'Passer rutilans(mock)',
    description: '(mock)比普通家麻雀更艳丽，雄鸟背部为鲜艳的肉桂红色。常在村庄和农田附近出没。',
    tags: ['红色背部', '活泼', '常见'],
    image: 'https://picsum.photos/seed/sparrow/400/300'
  }
};

export const DEFAULT_BIRD: BirdInfo = {
  id: 'unknown',
  nameCn: '未知鸟类(mock)',
  nameEn: 'Unknown Bird(mock)',
  scientificName: 'Aves sp.(mock)',
  description: '(mock)AI暂未在数据库中找到完全匹配的鸟类信息，可能是罕见品种或录音不够清晰。',
  tags: ['未知'],
  image: 'https://picsum.photos/seed/bird/400/300'
};
