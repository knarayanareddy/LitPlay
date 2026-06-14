/**
 * Event bus abstraction (§15).
 *
 * In production this publishes to Kafka (AWS MSK). In tests/local dev it uses
 * an in-memory bus. The interface is identical so services never branch on it.
 */

import type { EventEnvelope } from '@litplay/contracts';

export interface EventBus {
  publish(envelope: EventEnvelope<unknown>): Promise<void>;
}

/** In-memory event bus for tests and local development. */
export class InMemoryEventBus implements EventBus {
  readonly published: EventEnvelope[] = [];
  private handlers = new Map<string, Array<(e: EventEnvelope) => Promise<void>>>();

  subscribe(topic: string, handler: (e: EventEnvelope) => Promise<void>): void {
    const list = this.handlers.get(topic) ?? [];
    list.push(handler);
    this.handlers.set(topic, list);
  }

  async publish(envelope: EventEnvelope<unknown>): Promise<void> {
    this.published.push(envelope);
    const handlers = this.handlers.get(envelope.topic) ?? [];
    for (const h of handlers) {
      await h(envelope);
    }
  }
}

/**
 * Kafka-backed event bus (production). Uses kafkajs. The actual import is lazy
 * so services that don't publish events (or the test suite) never need a broker.
 */
export class KafkaEventBus implements EventBus {
  private producerPromise: Promise<import('kafkajs').Producer> | null = null;

  constructor(private brokers: string[] = []) {}

  private async getProducer(): Promise<import('kafkajs').Producer> {
    if (!this.producerPromise) {
      this.producerPromise = (async () => {
        const { Kafka } = await import('kafkajs');
        const kafka = new Kafka({ brokers: this.brokers, clientId: 'litplay' });
        const producer = kafka.producer();
        await producer.connect();
        return producer;
      })();
    }
    return this.producerPromise;
  }

  async publish(envelope: EventEnvelope<unknown>): Promise<void> {
    const producer = await this.getProducer();
    await producer.send({
      topic: envelope.topic,
      messages: [{ key: envelope.eventId, value: JSON.stringify(envelope) }],
    });
  }

  async disconnect(): Promise<void> {
    if (this.producerPromise) {
      const producer = await this.producerPromise;
      await producer.disconnect();
      this.producerPromise = null;
    }
  }
}

export function createEventBus(): EventBus {
  if (process.env.KAFKA_BROKERS) {
    return new KafkaEventBus(process.env.KAFKA_BROKERS.split(','));
  }
  return new InMemoryEventBus();
}
