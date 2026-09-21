import * as fs from 'fs';
import * as path from 'path';
import type * as puppeteer from 'puppeteer';
import { EventType, IncrementalSource, NodeType } from '@rrweb/types';
import type { eventWithTime } from '@rrweb/types';
import { vi } from 'vitest';
import { launchPuppeteer } from '../utils';

const startTime = 1_700_000_000_000;
const mutationTime = startTime + 250;

const seekEvents: eventWithTime[] = [
  {
    type: EventType.DomContentLoaded,
    data: {},
    timestamp: startTime,
  },
  {
    type: EventType.Meta,
    data: {
      href: 'http://localhost',
      width: 1000,
      height: 800,
    },
    timestamp: startTime + 1,
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
                childNodes: [],
              },
              {
                id: 10,
                type: NodeType.Element,
                tagName: 'body',
                attributes: {},
                childNodes: [],
              },
            ],
          },
        ],
      },
      initialOffset: { top: 0, left: 0 },
    },
    timestamp: startTime + 2,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: 10,
          previousId: -1,
          nextId: null,
          node: {
            id: 5,
            type: NodeType.Text,
            textContent: 'before-seek',
          },
        },
      ],
    },
    timestamp: startTime + 100,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: 10,
          previousId: 5,
          nextId: null,
          node: {
            id: 6,
            type: NodeType.Element,
            tagName: 'span',
            attributes: { 'data-marker': 'sibling' },
            childNodes: [],
          },
        },
      ],
    },
    timestamp: startTime + 200,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      texts: [{ id: 5, value: 'after-seek' }],
      attributes: [],
      removes: [],
      adds: [],
    },
    timestamp: mutationTime,
  },
  {
    type: EventType.IncrementalSnapshot,
    data: {
      source: IncrementalSource.Mutation,
      texts: [],
      attributes: [],
      removes: [],
      adds: [],
    },
    timestamp: startTime + 400,
  },
];

type SeekDirection = 'forward' | 'backward';

describe('virtual DOM synchronization after seek', () => {
  vi.setConfig({ testTimeout: 10_000 });

  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  let code: string;

  beforeAll(async () => {
    browser = await launchPuppeteer();
    code = fs.readFileSync(
      path.resolve(__dirname, '../../dist/rrweb.umd.cjs'),
      'utf8',
    );
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('about:blank');
    await page.evaluate(code);
  });

  afterEach(async () => {
    await page.close();
  });

  afterAll(async () => {
    await browser.close();
  });

  it.each<SeekDirection>(['forward', 'backward'])(
    'applies the first post-%s-seek mutation to the visible iframe DOM',
    async (direction) => {
      const result = await page.evaluate(
        async ({ direction, events, mutationTimestamp }) => {
          const { Replayer, ReplayerEvents } = rrweb;
          const replayer = new Replayer(events, {
            useVirtualDom: true,
            speed: 4,
            showWarning: false,
          });

          if (direction === 'backward') {
            replayer.pause(350);
          }

          replayer.pause(150);
          const seekTime = replayer.getCurrentTime();

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(new Error('Timed out waiting for post-seek mutation')),
              2_000,
            );
            replayer.on(ReplayerEvents.EventCast, (event) => {
              if (event.timestamp === mutationTimestamp) {
                clearTimeout(timeout);
                replayer.pause();
                resolve();
              }
            });
            replayer.play(150);
          });

          return {
            seekTime,
            currentTime: replayer.getCurrentTime(),
            bodyText: replayer.iframe.contentDocument?.body.textContent,
            siblingCount: replayer.iframe.contentDocument?.querySelectorAll(
              '[data-marker="sibling"]',
            ).length,
          };
        },
        {
          direction,
          events: seekEvents,
          mutationTimestamp: mutationTime,
        },
      );

      expect(result.seekTime).toBe(150);
      expect(result.currentTime).toBeGreaterThanOrEqual(250);
      expect(result.bodyText).toBe('after-seek');
      expect(result.siblingCount).toBe(1);
    },
  );
});
