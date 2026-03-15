import asyncio
import logging
import os

from dotenv import load_dotenv
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio

logger = logging.getLogger(__name__)

load_dotenv()

model_identifier = os.getenv('MODEL_IDENTIFIER', 'openai:gpt-5-mini')

logger.info(f"Creating agent with model: {model_identifier}")

try:
    server = MCPServerStdio(
        'uv', args=['run', 'investor-agent', 'stdio'], timeout=60, env=dict(os.environ)
    )
    agent = Agent(model_identifier, toolsets=[server])
    agent.set_mcp_sampling_model() # Allows MCP server to make LLM calls via the MCP client

    logger.info("Agent created successfully")
except Exception as e:
    logger.error(f"Failed to create Investor agent: {e}")
    raise


async def main():
    print("Chat with Investor Agent (type 'quit' to exit)")

    async with agent:
        result = None
        while True:
            try:
                user_input = input("\n👤: ").strip()
                if user_input.lower() in ['quit', 'exit', 'q']:
                    logger.info("Chat session ended by user")
                    break
                if not user_input:
                    continue

                logger.debug(f"Processing user input: {user_input}")
                result = await agent.run(user_input, message_history=result.new_messages() if result else None)
                print(f"🤖: {result.output}")

            except (KeyboardInterrupt, EOFError):
                logger.info("Chat session interrupted by user")
                break
            except Exception as e:
                logger.error(f"Error processing user input '{user_input}': {e}")
                print(f"❌ {e}")
                continue


if __name__ == "__main__":
    asyncio.run(main())