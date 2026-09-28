import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatSession } from './chat-session.entity';
import { ChatMessage } from './chat-message.entity';
import { User } from '../auth/entities/user.entity';

// Agents
import { OrchestratorAgent } from './agents/orchestrator.agent';
import { KnowledgeQAAgent } from './agents/knowledge-qa.agent';

// AI Client (Python Service)
import { AiClientService } from './ai-client.service';

// RAG
import { RagService } from './rag/rag.service';
import { EmbeddingService } from './rag/embedding.service';

// TTS
import { TTSService } from './tts/tts.service';

// Tools (Task 5 — Tool Calling)
import { ToolsRegistry } from './tools/tools.registry';
import { ToolPlannerService } from './tools/tool-planner.service';

// Config
import { AgentsConfig } from '../../config/agents.config';
import { MilvusConfig } from '../../config/milvus.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession, ChatMessage, User]),
    ConfigModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    // AI Client
    AiClientService,
    // Agents (Legacy)
    AgentsConfig,
    OrchestratorAgent,
    KnowledgeQAAgent,
    // RAG
    MilvusConfig,
    RagService,
    EmbeddingService,
    // TTS
    TTSService,
    // Tools (Task 5)
    ToolsRegistry,
    ToolPlannerService,
  ],
  exports: [ChatService, RagService, EmbeddingService, MilvusConfig, ToolsRegistry, ToolPlannerService],
})
export class ChatModule {}
