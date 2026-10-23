import type { TopicId as LearningSectionId, InfoBlock } from '@/types/ar';
import { learningSections } from '@/data/learningContent';

export interface Topic {
  id: LearningSectionId;
  index: number;
  title: string;
  shortTitle: string;
  shortLabel: string;
  accentColor: string;
  accentColorActive: string;
  assetLabel: string;
  overview: string;
  blocks: InfoBlock[];
  sourceVerified: boolean;
}

export const topics: Topic[] = [
  {
    id: 'os-fundamentals',
    index: 0,
    title: 'Kompetensi Sistem Operasi',
    shortTitle: 'SISTEM OPERASI',
    shortLabel: 'OS',
    accentColor: '#2d8be3',
    accentColorActive: '#2168a7',
    assetLabel: 'Motherboard & Komponen',
    overview: learningSections['os-fundamentals'].overview,
    sourceVerified: learningSections['os-fundamentals'].sourceVerified,
    blocks: [
      {
        type: 'p',
        text: learningSections['os-fundamentals'].overview,
      },
      {
        type: 'terms',
        title: 'Komponen Sistem',
        terms: learningSections['os-fundamentals'].components.map((c) => ({
          term: c.label,
          desc: c.description,
        })),
      },
      {
        type: 'p',
        title: learningSections['os-fundamentals'].subTopics[0].title,
        text: learningSections['os-fundamentals'].subTopics[0].summary,
      },
      {
        type: 'list',
        title: 'Fungsi OS',
        items: learningSections['os-fundamentals'].subTopics[0].details,
      },
      {
        type: 'note',
        text: learningSections['os-fundamentals'].subTopics[0].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['os-fundamentals'].subTopics[1].title,
        text: learningSections['os-fundamentals'].subTopics[1].summary,
      },
      {
        type: 'list',
        items: learningSections['os-fundamentals'].subTopics[1].details,
      },
      {
        type: 'note',
        text: learningSections['os-fundamentals'].subTopics[1].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['os-fundamentals'].subTopics[2].title,
        text: learningSections['os-fundamentals'].subTopics[2].summary,
      },
      {
        type: 'steps',
        title: 'Status Proses',
        steps: learningSections['os-fundamentals'].subTopics[2].details,
      },
      {
        type: 'note',
        text: learningSections['os-fundamentals'].subTopics[2].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['os-fundamentals'].subTopics[3].title,
        text: learningSections['os-fundamentals'].subTopics[3].summary,
      },
      {
        type: 'list',
        items: learningSections['os-fundamentals'].subTopics[3].details,
      },
      {
        type: 'note',
        text: learningSections['os-fundamentals'].subTopics[3].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['os-fundamentals'].subTopics[4].title,
        text: learningSections['os-fundamentals'].subTopics[4].summary,
      },
      {
        type: 'list',
        items: learningSections['os-fundamentals'].subTopics[4].details,
      },
      {
        type: 'note',
        text: learningSections['os-fundamentals'].subTopics[4].visualRelation,
      },
    ],
  },
  {
    id: 'scheduling',
    index: 1,
    title: 'Penjadwalan Proses',
    shortTitle: 'PENJADWALAN',
    shortLabel: 'CPU',
    accentColor: '#48c86a',
    accentColorActive: '#2f8c49',
    assetLabel: 'CPU / Prosesor',
    overview: learningSections['scheduling'].overview,
    sourceVerified: learningSections['scheduling'].sourceVerified,
    blocks: [
      {
        type: 'p',
        text: learningSections['scheduling'].overview,
      },
      {
        type: 'terms',
        title: 'Komponen Penjadwalan',
        terms: learningSections['scheduling'].components.map((c) => ({
          term: c.label,
          desc: c.description,
        })),
      },
      {
        type: 'p',
        title: learningSections['scheduling'].subTopics[0].title,
        text: learningSections['scheduling'].subTopics[0].summary,
      },
      {
        type: 'list',
        items: learningSections['scheduling'].subTopics[0].details,
      },
      {
        type: 'note',
        text: learningSections['scheduling'].subTopics[0].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['scheduling'].subTopics[1].title,
        text: learningSections['scheduling'].subTopics[1].summary,
      },
      {
        type: 'list',
        items: learningSections['scheduling'].subTopics[1].details,
      },
      {
        type: 'note',
        text: learningSections['scheduling'].subTopics[1].visualRelation,
      },
      {
        type: 'cards',
        title: 'Algoritma Penjadwalan',
        cards: [
          {
            title: 'FCFS (First-Come First-Served)',
            desc: learningSections['scheduling'].subTopics[2].summary,
          },
          {
            title: 'SJF (Shortest Job First)',
            desc: learningSections['scheduling'].subTopics[3].summary,
          },
          {
            title: 'Round Robin',
            desc: learningSections['scheduling'].subTopics[4].summary,
          },
          {
            title: 'Priority Scheduling',
            desc: learningSections['scheduling'].subTopics[5].summary,
          },
          {
            title: 'Multilevel Queue',
            desc: learningSections['scheduling'].subTopics[6].summary,
          },
        ],
      },
      {
        type: 'list',
        title: 'FCFS — Detail',
        items: learningSections['scheduling'].subTopics[2].details,
      },
      {
        type: 'list',
        title: 'SJF — Detail',
        items: learningSections['scheduling'].subTopics[3].details,
      },
      {
        type: 'list',
        title: 'Round Robin — Detail',
        items: learningSections['scheduling'].subTopics[4].details,
      },
      {
        type: 'list',
        title: 'Priority — Detail',
        items: learningSections['scheduling'].subTopics[5].details,
      },
      {
        type: 'list',
        title: 'Multilevel Queue — Detail',
        items: learningSections['scheduling'].subTopics[6].details,
      },
      {
        type: 'sim',
        title: 'Simulasi Penjadwalan CPU',
        simType: 'scheduling',
      },
    ],
  },
  {
    id: 'memory',
    index: 2,
    title: 'Manajemen Memori',
    shortTitle: 'MANAJEMEN MEMORI',
    shortLabel: 'MEMORI',
    accentColor: '#a158e8',
    accentColorActive: '#7039a5',
    assetLabel: 'RAM',
    overview: learningSections['memory'].overview,
    sourceVerified: learningSections['memory'].sourceVerified,
    blocks: [
      {
        type: 'p',
        text: learningSections['memory'].overview,
      },
      {
        type: 'terms',
        title: 'Komponen Memori',
        terms: learningSections['memory'].components.map((c) => ({
          term: c.label,
          desc: c.description,
        })),
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[0].title,
        text: learningSections['memory'].subTopics[0].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[0].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[0].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[1].title,
        text: learningSections['memory'].subTopics[1].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[1].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[1].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[2].title,
        text: learningSections['memory'].subTopics[2].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[2].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[2].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[3].title,
        text: learningSections['memory'].subTopics[3].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[3].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[3].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[4].title,
        text: learningSections['memory'].subTopics[4].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[4].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[4].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[5].title,
        text: learningSections['memory'].subTopics[5].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[5].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[5].visualRelation,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[6].title,
        text: learningSections['memory'].subTopics[6].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[6].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[6].visualRelation,
      },
      {
        type: 'cards',
        title: 'Algoritma Penggantian Halaman',
        cards: [
          {
            title: 'FIFO',
            desc: learningSections['memory'].subTopics[7].summary,
          },
          {
            title: 'LRU',
            desc: learningSections['memory'].subTopics[8].summary,
          },
          {
            title: 'Optimal',
            desc: learningSections['memory'].subTopics[9].summary,
          },
        ],
      },
      {
        type: 'list',
        title: 'FIFO — Detail',
        items: learningSections['memory'].subTopics[7].details,
      },
      {
        type: 'list',
        title: 'LRU — Detail',
        items: learningSections['memory'].subTopics[8].details,
      },
      {
        type: 'list',
        title: 'Optimal — Detail',
        items: learningSections['memory'].subTopics[9].details,
      },
      {
        type: 'p',
        title: learningSections['memory'].subTopics[10].title,
        text: learningSections['memory'].subTopics[10].summary,
      },
      {
        type: 'list',
        items: learningSections['memory'].subTopics[10].details,
      },
      {
        type: 'note',
        text: learningSections['memory'].subTopics[10].visualRelation,
      },
      {
        type: 'sim',
        title: 'Simulasi Penggantian Halaman',
        simType: 'memory',
      },
    ],
  },
];

export function getTopicById(id: LearningSectionId): Topic | undefined {
  return topics.find((t) => t.id === id);
}
