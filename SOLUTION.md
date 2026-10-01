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
- Caching



## Challenge 2

The same principle as solution to challenge 1. We give users the ability to define their own client fields. The only difference is, we maintain a set of default fields e.g. id, portfolio name, or anything that is consistent across portfolios. 

#### Implemented:

- Allow users to add / remove new client fields
  - The field also support dynamic choices



#### If time allowed:

- Implement client fields on the portfolios level + add versioning 
  - Maybe it's possible for a portfolio to use different client fields, etc



## Challenge 3

The principle is to use background task like Redis + Celery since we are using Django. Once users click on 'generate report', we will display notification in the UI to show them that the task has been received. Users then can navigate and do something else before being notified again that it's one. 

#### Implemented:

- simple Redis + Celery combo for background tasks 
- Simple in app notification



#### If time allowed:

- Allow users to choose how they want to be notified e.g. Whatsapp, Text messages, Emails, browser based, etc 
  - Needs to consider fan-out e.g. what happens if users opt for both whatsapp and emails?
- Idempotency 
  - Only mark failed if retries are exhausted 
  - Before retrying expensive task e.g. LLM generation, check if it's completed. If it is completed, just return w/ retyring LLM generation
- Tenant aware notification 
- Consider using "real production broker" e.g. RabbitMQ instead of Redis
  - Keep Redis as a cache engine

## Challenge 4 

For multi-tenancy there is usually 3 different patterns depending on use cases:

- Pattern A: Same DB, same schema
  - Easy to do, but can be not secure unless there are additional layers of protection that are put in place 
  - Low tech ops risk 
- Pattern B: Schema per tenant
  - Secure but can be expensive. Usually a compromise between pattern A and pattern B
  - But migration job can be a nightmare. So high tech ops costs 
- Pattern C: DB-per-tenant 
  - Very secure but expensive 
  - Migration job is technically easy if the data models are all the same so tech operation is very doable

In my current work for example, we have both Pattern B and Pattern C because we want to minimise the data leakage risks. The private banking industry is really strict. A data leakage e.g. tenant A gains access to data from tenant B will be a game over and we'll be on the news. 

For Nettle, maybe we can start from Pattern A and then move to Pattern C for some bigger clients. Some protective measures to be put in place:



- Request scoped tenant + user permission 
- Postgres RLS 
  - to catch forgotten filters 
- Put some middleware:
  - Tenant middleware -> extract tenant from auth + claim 
  - Role middleware -> check role of users + membersip 
  - PostgresRLS middleware -> add tenant name for every single query to DB
- Data models:
  - Add tenant field to existing data models 
  - Add TenantMembership data model 
    - tenant name
    - user name
    - role
  - Can always add role permission table if needed 

