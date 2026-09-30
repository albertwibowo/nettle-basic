## Challenge 1

The basic principle is to allow end users to create their own templates. For each report, they can add a new section + a few questions they want the LLMs to answer. The questions are essentially the content of a section. Asking LLM to answer questions are generally better than allowing them to 'think' and decide what the content of a section should be. Additionally, structured output via json schema is used to ensure consistency of the LLM output. 

#### Implemented:

- New template tab in the UI 
  - Allow users to add / remove templates, complete with versioning 
  - For each template, users can add/remove sections and questions
- When generating reports, users can choose which templates they want to use
  - Hardening is implemented - users can only select template linked to a specific portfolio + default template
- Use structured output instead of normal text generation 
- Use OpenRouter instead of Anthropic 
  - To avoid vendor lock-in

#### If time allowed:

- Batching the LLM call
  - At the moment, we brute force it - send all of the context and ask the LLM to answer all questions. This is not good if context is huge and the report generated has let say 100 sections w/ 1000 questions each 
  - Need to do some batching and with batching, ensuring consistency across calls is much harder 
  - Associated w/ costs and quality 
- Add retries
  - What if the LLMs fail to generate? It will stop the whole process. 
- Allow LLMs to keep generating if some sections fail 





