/** notification-service — process entry point (§10.8). */

import { startService } from '@litplay/server-kit';
import { TOPICS, type EventEnvelope } from '@litplay/contracts';
import { buildApp } from './app.js';

const { app, service } = buildApp();
const PORT = parseInt(process.env.PORT ?? '3005', 10);

async function startKafkaConsumer(): Promise<void> {
  const brokers = process.env.KAFKA_BROKERS?.split(',').filter(Boolean);
  if (!brokers?.length) return;

  const { Kafka } = await import('kafkajs');
  const kafka = new Kafka({ brokers, clientId: 'notification-service' });
  const consumer = kafka.consumer({ groupId: 'notification-service' });
  await consumer.connect();
  for (const topic of [
    TOPICS.AUTH_USER_CREATED,
    TOPICS.AUTH_USER_DELETED,
    TOPICS.CONTENT_ASSIGNMENT_CREATED,
  ]) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
      await service.handleEvent(envelope);
    },
  });
}

await startKafkaConsumer();
void startService(app, PORT);
