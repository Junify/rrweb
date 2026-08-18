import {
  EventType,
  IncrementalSource,
  MediaInteractions,
  NodeType,
} from '@rrweb/types';
import type { eventWithTime } from '@rrweb/types';

const startTime = 1_700_000_100_000;

const baseSnapshot: eventWithTime[] = [
  {
    type: EventType.Meta,
    data: { href: 'about:blank', width: 800, height: 600 },
    timestamp: startTime,
  },
  {
    type: EventType.FullSnapshot,
    data: {
      node: {
        id: 1,
        type: NodeType.Document,
        childNodes: [
          {
            id: 2,
            type: NodeType.DocumentType,
            name: 'html',
            publicId: '',
            systemId: '',
          },
          {
            id: 3,
            type: NodeType.Element,
            tagName: 'html',
            attributes: {},
            childNodes: [
              {
                id: 4,
                type: NodeType.Element,
                tagName: 'head',
                attributes: {},
                childNodes: [
                  {
                    id: 5,
                    type: NodeType.Element,
                    tagName: 'style',
                    attributes: {},
                    childNodes: [],
                  },
                ],
              },
              {
                id: 6,
                type: NodeType.Element,
                tagName: 'body',
                attributes: {},
                childNodes: [
                  {
                    id: 7,
                    type: NodeType.Text,
                    textContent: 'legacy text target',
                  },
                  {
                    id: 8,
                    type: NodeType.Element,
                    tagName: 'video',
                    attributes: {},
                    childNodes: [],
                  },
                  {
                    id: 9,
                    type: NodeType.Element,
                    tagName: 'div',
                    attributes: { class: 'valid-style-target' },
                    childNodes: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      initialOffset: { top: 0, left: 0 },
    },
    timestamp: startTime + 10,
  },
];

export const malformedMediaEvents: eventWithTime[] = [
  ...baseSnapshot,
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.MediaInteraction,
      type: MediaInteractions.Play,
      id: 7,
      currentTime: 1.5,
    },
    timestamp: startTime + 20,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.MediaInteraction,
      type: MediaInteractions.Pause,
      id: 8,
      currentTime: 4.25,
      volume: 0.5,
      muted: true,
      playbackRate: 1,
    },
    timestamp: startTime + 30,
  },
];

export const malformedStyleRuleEvents: eventWithTime[] = [
  ...baseSnapshot,
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      adds: [],
      removes: [],
      texts: [{ id: 7, value: 'activates virtual DOM' }],
      attributes: [],
    },
    timestamp: startTime + 20,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.StyleSheetRule,
      id: 9,
      adds: [{ rule: '.ignored-malformed-rule { color: red; }', index: 0 }],
    },
    timestamp: startTime + 30,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.StyleSheetRule,
      id: 5,
      adds: [
        {
          rule: '.valid-style-target { color: rgb(17, 34, 51); }',
          index: 0,
        },
      ],
    },
    timestamp: startTime + 40,
  },
];
