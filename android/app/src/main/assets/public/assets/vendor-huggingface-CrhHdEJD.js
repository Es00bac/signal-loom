import{r as e}from"./rolldown-runtime-BYbx6iT9.js";var t=`https://huggingface.co`,n=`https://router.huggingface.co`,r=`${n}/v1`,i=`X-HF-Bill-To`,a={baseten:{},"black-forest-labs":{},cerebras:{},clarifai:{},cohere:{},deepinfra:{},"fal-ai":{},"featherless-ai":{},"fireworks-ai":{},groq:{},"hf-inference":{},hyperbolic:{},nebius:{},novita:{},nscale:{},nvidia:{},openai:{},publicai:{},ovhcloud:{},replicate:{},sambanova:{},scaleway:{},together:{},wavespeed:{},"zai-org":{}},o=class extends Error{constructor(e){super(e),this.name=`InferenceClientError`}},s=class extends o{constructor(e){super(e),this.name=`InputError`}},c=class extends o{constructor(e){super(e),this.name=`RoutingError`}},l=class extends o{httpRequest;httpResponse;constructor(e,t,n){super(e),this.httpRequest={...t,...t.headers?{headers:{...t.headers,...`Authorization`in t.headers?{Authorization:`Bearer [redacted]`}:void 0}}:void 0},this.httpResponse=n}},u=class extends l{constructor(e,t,n){super(e,t,n),this.name=`ProviderApiError`}},d=class extends l{constructor(e,t,n){super(e,t,n),this.name=`HubApiError`}},f=class extends o{constructor(e){super(e),this.name=`ProviderOutputError`}};function p(e){return Array.isArray(e)?e:[e]}var m=class{provider;baseUrl;clientSideRoutingOnly;constructor(e,t,n=!1){this.provider=e,this.baseUrl=t,this.clientSideRoutingOnly=n}makeBaseUrl(e){return e.authMethod===`provider-key`?this.baseUrl:`${n}/${this.provider}`}makeBody(e){return`data`in e.args&&e.args.data?e.args.data:JSON.stringify(this.preparePayload(e))}makeUrl(e){let t=this.makeBaseUrl(e),n=this.makeRoute(e).replace(/^\/+/,``);return e.urlTransform?e.urlTransform(`${t}/${n}`):`${t}/${n}`}prepareHeaders(e,t){let n={};return e.authMethod!==`none`&&(n.Authorization=`Bearer ${e.accessToken}`),t||(n[`Content-Type`]=`application/json`),n}},h=class extends m{constructor(e,t,n=!1){super(e,t,n)}makeRoute(){return`v1/chat/completions`}preparePayload(e){return{...e.args,model:e.model}}async getResponse(e){if(typeof e==`object`&&Array.isArray(e?.choices)&&typeof e?.created==`number`&&typeof e?.id==`string`&&typeof e?.model==`string`&&(e.system_fingerprint===void 0||e.system_fingerprint===null||typeof e.system_fingerprint==`string`)&&typeof e?.usage==`object`)return e;throw new f(`Expected ChatCompletionOutput`)}},g=class extends m{constructor(e,t,n=!1){super(e,t,n)}preparePayload(e){return{...e.args,model:e.model}}makeRoute(){return`v1/completions`}async getResponse(e){let t=p(e);if(Array.isArray(t)&&t.length>0&&t.every(e=>typeof e==`object`&&!!e&&`generated_text`in e&&typeof e.generated_text==`string`))return t[0];throw new f(`Expected Array<{generated_text: string}>`)}},_=class extends h{constructor(){super(`auto`,`https://router.huggingface.co`)}makeBaseUrl(e){if(e.authMethod!==`hf-token`)throw new c(`Cannot select auto-router when using non-Hugging Face API key.`);return this.baseUrl}};function v(e){if(globalThis.Buffer)return globalThis.Buffer.from(e).toString(`base64`);{let t=[];return e.forEach(e=>{t.push(String.fromCharCode(e))}),globalThis.btoa(t.join(``))}}async function y(e,t=`image/jpeg`){let n=await e.arrayBuffer();return`data:${t};base64,${v(new Uint8Array(n))}`}function ee(e,t){return Object.assign({},...t.map(t=>{if(e[t]!==void 0)return{[t]:e[t]}}))}function te(e,t){return e.includes(t)}function b(e,t){let n=Array.isArray(t)?t:[t];return ee(e,Object.keys(e).filter(e=>!te(n,e)))}var ne=[`feature-extraction`,`sentence-similarity`],x=class extends m{constructor(){super(`hf-inference`,`${n}/hf-inference`)}preparePayload(e){return e.args}makeUrl(e){return e.model.startsWith(`http://`)||e.model.startsWith(`https://`)?e.model:super.makeUrl(e)}makeRoute(e){return e.task&&[`feature-extraction`,`sentence-similarity`].includes(e.task)?`models/${e.model}/pipeline/${e.task}`:`models/${e.model}`}async getResponse(e){return e}},re=class extends x{preparePayload(e){if(e.outputType===`url`)throw new s(`hf-inference provider does not support URL output. Use outputType 'blob', 'dataUrl' or 'json' instead.`);return e.args}async getResponse(e,t,n,r){if(!e)throw new f(`Received malformed response from HF-Inference text-to-image API: response is undefined`);if(typeof e==`object`){if(r===`json`)return{...e};if(`data`in e&&Array.isArray(e.data)&&e.data[0].b64_json){let t=e.data[0].b64_json;return r===`dataUrl`?`data:image/jpeg;base64,${t}`:await(await fetch(`data:image/jpeg;base64,${t}`)).blob()}if(`output`in e&&Array.isArray(e.output)){let t=await(await fetch(e.output[0])).blob();return r===`dataUrl`?y(t):t}}if(e instanceof Blob)return r===`dataUrl`?y(e):r===`json`?{output:await y(e)}:e;throw new f(`Received malformed response from HF-Inference text-to-image API: expected a Blob`)}},ie=class extends x{makeUrl(e){let t;return t=e.model.startsWith(`http://`)||e.model.startsWith(`https://`)?e.model.trim():`${this.makeBaseUrl(e)}/models/${e.model}`,t=t.replace(/\/+$/,``),t.endsWith(`/v1`)?t+=`/chat/completions`:t.endsWith(`/chat/completions`)||(t+=`/v1/chat/completions`),t}preparePayload(e){return{...e.args,model:e.model}}async getResponse(e){return e}},ae=class extends x{async getResponse(e){let t=p(e);if(Array.isArray(t)&&t.every(e=>`generated_text`in e&&typeof e?.generated_text==`string`))return t?.[0];throw new f(`Received malformed response from HF-Inference text generation API: expected Array<{generated_text: string}>`)}},oe=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e==`object`&&!!e&&typeof e.label==`string`&&typeof e.score==`number`))return e;throw new f(`Received malformed response from HF-Inference audio-classification API: expected Array<{label: string, score: number}> but received different format`)}},se=class extends x{async getResponse(e){return e}async preparePayloadAsync(e){return`data`in e?e:{...b(e,`inputs`),data:e.inputs}}},ce=class extends x{async getResponse(e){if(!Array.isArray(e))throw new f(`Received malformed response from HF-Inference audio-to-audio API: expected Array`);if(!e.every(e=>typeof e==`object`&&e&&`label`in e&&typeof e.label==`string`&&`content-type`in e&&typeof e[`content-type`]==`string`&&`blob`in e&&typeof e.blob==`string`))throw new f(`Received malformed response from HF-Inference audio-to-audio API: expected Array<{label: string, audio: Blob}>`);return e}},le=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e==`object`&&!!e&&typeof e?.answer==`string`&&(typeof e.end==`number`||e.end===void 0)&&(typeof e.score==`number`||e.score===void 0)&&(typeof e.start==`number`||e.start===void 0)))return e[0];throw new f(`Received malformed response from HF-Inference document-question-answering API: expected Array<{answer: string, end: number, score: number, start: number}>`)}},ue=class extends x{async getResponse(e){let t=(e,n,r=0)=>r>n?!1:e.every(e=>Array.isArray(e))?e.every(e=>t(e,n,r+1)):e.every(e=>typeof e==`number`);if(Array.isArray(e)&&t(e,3,0))return e;throw new f(`Received malformed response from HF-Inference feature-extraction API: expected Array<number[][][] | number[][] | number[] | number>`)}},S=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e.label==`string`&&typeof e.score==`number`))return e;throw new f(`Received malformed response from HF-Inference image-classification API: expected Array<{label: string, score: number}>`)}},de=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e.label==`string`&&typeof e.mask==`string`&&(e.score===void 0||typeof e.score==`number`)))return e;throw new f(`Received malformed response from HF-Inference image-segmentation API: expected Array<{label: string, mask: string, score: number}>`)}async preparePayloadAsync(e){return{...e,inputs:v(new Uint8Array(e.inputs instanceof ArrayBuffer?e.inputs:await e.inputs.arrayBuffer()))}}},fe=class extends x{async getResponse(e){if(typeof e?.generated_text!=`string`)throw new f(`Received malformed response from HF-Inference image-to-text API: expected {generated_text: string}`);return e}async preparePayloadAsync(e){return`data`in e?e:{...b(e,`inputs`),data:e.inputs}}},pe=class extends x{async preparePayloadAsync(e){return e.parameters?{...e,inputs:v(new Uint8Array(e.inputs instanceof ArrayBuffer?e.inputs:await e.inputs.arrayBuffer()))}:{...e,model:e.model,data:e.inputs}}async getResponse(e){if(e instanceof Blob)return e;throw new f(`Received malformed response from HF-Inference image-to-image API: expected Blob`)}},me=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e.label==`string`&&typeof e.score==`number`&&typeof e.box.xmin==`number`&&typeof e.box.ymin==`number`&&typeof e.box.xmax==`number`&&typeof e.box.ymax==`number`))return e;throw new f(`Received malformed response from HF-Inference object-detection API: expected Array<{label: string, score: number, box: {xmin: number, ymin: number, xmax: number, ymax: number}}>`)}},he=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e.label==`string`&&typeof e.score==`number`))return e;throw new f(`Received malformed response from HF-Inference zero-shot-image-classification API: expected Array<{label: string, score: number}>`)}},ge=class extends x{async getResponse(e){let t=e?.[0];if(Array.isArray(t)&&t.every(e=>typeof e?.label==`string`&&typeof e.score==`number`))return t;throw new f(`Received malformed response from HF-Inference text-classification API: expected Array<{label: string, score: number}>`)}},_e=class extends x{async getResponse(e){if(Array.isArray(e)?e.every(e=>typeof e==`object`&&!!e&&typeof e.answer==`string`&&typeof e.end==`number`&&typeof e.score==`number`&&typeof e.start==`number`):typeof e==`object`&&e&&typeof e.answer==`string`&&typeof e.end==`number`&&typeof e.score==`number`&&typeof e.start==`number`)return Array.isArray(e)?e[0]:e;throw new f(`Received malformed response from HF-Inference question-answering API: expected Array<{answer: string, end: number, score: number, start: number}>`)}},ve=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e.score==`number`&&typeof e.sequence==`string`&&typeof e.token==`number`&&typeof e.token_str==`string`))return e;throw new f(`Received malformed response from HF-Inference fill-mask API: expected Array<{score: number, sequence: string, token: number, token_str: string}>`)}},ye=class e extends x{async getResponse(t){if(typeof t==`object`&&t&&`labels`in t&&`scores`in t&&Array.isArray(t.labels)&&Array.isArray(t.scores)&&t.labels.length===t.scores.length&&t.labels.every(e=>typeof e==`string`)&&t.scores.every(e=>typeof e==`number`)){let e=t.scores;return t.labels.map((t,n)=>({label:t,score:e[n]}))}if(Array.isArray(t)&&t.every(e.validateOutputElement))return t;throw new f(`Received malformed response from HF-Inference zero-shot-classification API: expected Array<{label: string, score: number}>`)}static validateOutputElement(e){return typeof e==`object`&&!!e&&`label`in e&&`score`in e&&typeof e.label==`string`&&typeof e.score==`number`}},be=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e==`number`))return e;throw new f(`Received malformed response from HF-Inference sentence-similarity API: expected Array<number>`)}},xe=class e extends x{static validate(e){return typeof e==`object`&&!!e&&`aggregator`in e&&typeof e.aggregator==`string`&&`answer`in e&&typeof e.answer==`string`&&`cells`in e&&Array.isArray(e.cells)&&e.cells.every(e=>typeof e==`string`)&&`coordinates`in e&&Array.isArray(e.coordinates)&&e.coordinates.every(e=>Array.isArray(e)&&e.every(e=>typeof e==`number`))}async getResponse(t){if(Array.isArray(t)&&Array.isArray(t)?t.every(t=>e.validate(t)):e.validate(t))return Array.isArray(t)?t[0]:t;throw new f(`Received malformed response from HF-Inference table-question-answering API: expected {aggregator: string, answer: string, cells: string[], coordinates: number[][]}`)}},Se=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e.end==`number`&&typeof e.entity_group==`string`&&typeof e.score==`number`&&typeof e.start==`number`&&typeof e.word==`string`))return e;throw new f(`Received malformed response from HF-Inference token-classification API: expected Array<{end: number, entity_group: string, score: number, start: number, word: string}>`)}},Ce=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e?.translation_text==`string`))return e?.length===1?e?.[0]:e;throw new f(`Received malformed response from HF-Inference translation API: expected Array<{translation_text: string}>`)}},we=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e?.summary_text==`string`))return e?.[0];throw new f(`Received malformed response from HF-Inference summarization API: expected Array<{summary_text: string}>`)}},Te=class extends x{async getResponse(e){return e}},Ee=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e==`number`))return e;throw new f(`Received malformed response from HF-Inference tabular-classification API: expected Array<number>`)}},De=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e==`object`&&!!e&&typeof e?.answer==`string`&&typeof e.score==`number`))return e[0];throw new f(`Received malformed response from HF-Inference visual-question-answering API: expected Array<{answer: string, score: number}>`)}},Oe=class extends x{async getResponse(e){if(Array.isArray(e)&&e.every(e=>typeof e==`number`))return e;throw new f(`Received malformed response from HF-Inference tabular-regression API: expected Array<number>`)}},ke=class extends x{async getResponse(e){return e}},Ae=console;function je(e){Ae=e}function Me(){return Ae}var Ne=new Map;function Pe(e,t){return t?Array.isArray(t)?t:Object.entries(t).map(([t,n])=>({provider:t,hfModelId:e,providerId:n.providerId,status:n.status,task:n.task,adapter:n.adapter,adapterWeightsPath:n.adapterWeightsPath})):[]}async function Fe(e,n,r){let i;if(Ne.has(e))i=Ne.get(e);else{let a=`${t}/api/models/${e}?expand[]=inferenceProviderMapping`,o=await(r?.fetch??fetch)(a,{headers:n?.startsWith(`hf_`)?{Authorization:`Bearer ${n}`}:{}});if(!o.ok)if(o.headers.get(`Content-Type`)?.startsWith(`application/json`)){let t=await o.json();if(`error`in t&&typeof t.error==`string`)throw new d(`Failed to fetch inference provider mapping for model ${e}: ${t.error}`,{url:a,method:`GET`},{requestId:o.headers.get(`x-request-id`)??``,status:o.status,body:t})}else throw new d(`Failed to fetch inference provider mapping for model ${e}`,{url:a,method:`GET`},{requestId:o.headers.get(`x-request-id`)??``,status:o.status,body:await o.text()});let s=null;try{s=await o.json()}catch{throw new d(`Failed to fetch inference provider mapping for model ${e}: malformed API response, invalid JSON`,{url:a,method:`GET`},{requestId:o.headers.get(`x-request-id`)??``,status:o.status,body:await o.text()})}if(!s?.inferenceProviderMapping)throw new d(`We have not been able to find inference provider information for model ${e}.`,{url:a,method:`GET`},{requestId:o.headers.get(`x-request-id`)??``,status:o.status,body:await o.text()});i=Pe(e,s.inferenceProviderMapping),Ne.set(e,i)}return i}async function Ie(e,t){let n=Me();if(e.provider===`auto`&&e.task===`conversational`)return{hfModelId:e.modelId,provider:`auto`,providerId:e.modelId,status:`live`,task:`conversational`};if(a[e.provider][e.modelId])return a[e.provider][e.modelId];let r=(await Fe(e.modelId,e.accessToken,t)).find(t=>t.provider===e.provider);if(r){if(!te(e.provider===`hf-inference`&&te(ne,e.task)?ne:[e.task],r.task))throw new s(`Model ${e.modelId} is not supported for task ${e.task} and provider ${e.provider}. Supported task: ${r.task}.`);return r.status===`staging`&&n.warn(`Model ${e.modelId} is in staging mode for provider ${e.provider}. Meant for test purposes only.`),r}return null}async function C(e,t,n){let r=Me();if(n){if(e)throw new s(`Specifying both endpointUrl and provider is not supported.`);return`hf-inference`}if(e||=(r.log(`Defaulting to 'auto' which will select the first provider available for the model, sorted by the user's order in https://hf.co/settings/inference-providers.`),`auto`),e===`auto`){if(!t)throw new s(`Specifying a model is required when provider is 'auto'`);e=(await Fe(t))[0]?.provider,r.log(`Auto selected provider:`,e)}if(!e)throw new s(`No Inference Provider available for model ${t}.`);return e}var Le=`https://inference.baseten.co`,Re=class extends h{constructor(){super(`baseten`,Le)}},ze=`https://api.clarifai.com`,Be=class extends h{constructor(){super(`clarifai`,ze)}makeRoute(){return`/v2/ext/openai/v1/chat/completions`}prepareHeaders(e,t){let n={Authorization:e.authMethod===`provider-key`?`Key ${e.accessToken}`:`Bearer ${e.accessToken}`};return t||(n[`Content-Type`]=`application/json`),n}};function Ve(e){return new Promise(t=>{setTimeout(()=>t(),e)})}var He=`https://api.us1.bfl.ai`,Ue=class extends m{constructor(){super(`black-forest-labs`,He)}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs}}prepareHeaders(e,t){let n={Authorization:e.authMethod===`provider-key`?`X-Key ${e.accessToken}`:`Bearer ${e.accessToken}`};return t||(n[`Content-Type`]=`application/json`),n}makeRoute(e){if(!e)throw new s(`Params are required`);return`/v1/${e.model}`}async getResponse(e,t,n,r){let i=Me(),a=new URL(e.polling_url);for(let e=0;e<5;e++){await Ve(1e3),i.debug(`Polling Black Forest Labs API for the result... ${e+1}/5`),a.searchParams.set(`attempt`,e.toString(10));let t=await fetch(a,{headers:{"Content-Type":`application/json`}});if(!t.ok)throw new u(`Failed to fetch result from black forest labs API`,{url:a.toString(),method:`GET`,headers:{"Content-Type":`application/json`}},{requestId:t.headers.get(`x-request-id`)??``,status:t.status,body:await t.text()});let n=await t.json();if(typeof n==`object`&&n&&`status`in n&&typeof n.status==`string`&&n.status===`Ready`&&`result`in n&&typeof n.result==`object`&&n.result&&`sample`in n.result&&typeof n.result.sample==`string`)return r===`json`?n.result:r===`url`?n.result.sample:await(await fetch(n.result.sample)).blob()}throw new f(`Timed out while waiting for the result from black forest labs API - aborting after 5 attempts`)}},We=class extends h{constructor(){super(`cerebras`,`https://api.cerebras.ai`)}},Ge=class extends h{constructor(){super(`cohere`,`https://api.cohere.com`)}makeRoute(){return`/compatibility/v1/chat/completions`}},Ke=`https://api.deepinfra.com`,qe=class extends h{constructor(){super(`deepinfra`,Ke)}makeRoute(){return`v1/openai/chat/completions`}},Je=class extends g{constructor(){super(`deepinfra`,Ke)}makeRoute(){return`v1/openai/completions`}preparePayload(e){let t=e.args.parameters;return{model:e.model,prompt:e.args.inputs,...b(e.args,[`inputs`,`parameters`]),...t?{max_tokens:t.max_new_tokens,...b(t,[`max_new_tokens`])}:void 0}}async getResponse(e){if(typeof e==`object`&&e&&Array.isArray(e.choices)&&e.choices.length>0){let t=e.choices[0].text;if(typeof t==`string`)return{generated_text:t}}throw new f(`Received malformed response from DeepInfra text-generation API: expected OpenAI completion payload`)}};function w(e){return/^http(s?):/.test(e)||e.startsWith(`/`)}var Ye=[`audio/mpeg`,`audio/mp4`,`audio/wav`,`audio/x-wav`],Xe=class extends m{constructor(e){super(`fal-ai`,e||`https://fal.run`)}preparePayload(e){return e.args}makeRoute(e){return`/${e.model}`}prepareHeaders(e,t){let n={Authorization:e.authMethod===`provider-key`?`Key ${e.accessToken}`:`Bearer ${e.accessToken}`};return t||(n[`Content-Type`]=`application/json`),n}},Ze=class extends Xe{makeRoute(e){return e.authMethod===`provider-key`?`/${e.model}`:`/${e.model}?_subdomain=queue`}async getResponseFromQueueApi(e,t,n){if(!t||!n)throw new s(`URL and headers are required for ${this.task} task`);if(!e.request_id)throw new f(`Received malformed response from Fal.ai ${this.task} API: no request ID found in the response`);let r=e.status,i=new URL(t),a=`${i.protocol}//${i.host}${i.host===`router.huggingface.co`?`/fal-ai`:``}`,o=new URL(e.response_url).pathname,c=i.search,l=`${a}${o}/status${c}`,d=`${a}${o}${c}`;for(;r!==`COMPLETED`;){await Ve(500);let e=await fetch(l,{headers:n});if(!e.ok)throw new u(`Failed to fetch response status from fal-ai API`,{url:l,method:`GET`},{requestId:e.headers.get(`x-request-id`)??``,status:e.status,body:await e.text()});try{r=(await e.json()).status}catch{throw new f(`Failed to parse status response from fal-ai API: received malformed response`)}}let p=await fetch(d,{headers:n}),m;try{m=await p.json()}catch{throw new f(`Failed to parse result response from fal-ai API: received malformed response`)}return m}};function Qe(e,n){return`${t}/${e}/resolve/main/${n}`}var $e=class extends Ze{task;constructor(){super(`https://queue.fal.run`),this.task=`text-to-image`}preparePayload(e){let t={...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs};return e.mapping?.adapter===`lora`&&e.mapping.adapterWeightsPath&&(t.loras=[{path:Qe(e.mapping.hfModelId,e.mapping.adapterWeightsPath),scale:1}],e.mapping.providerId===`fal-ai/lora`&&(t.model_name=`stabilityai/stable-diffusion-xl-base-1.0`)),t}async getResponse(e,t,n,r){let i=await this.getResponseFromQueueApi(e,t,n);if(typeof i==`object`&&`images`in i&&Array.isArray(i.images)&&i.images.length>0&&`url`in i.images[0]&&typeof i.images[0].url==`string`&&w(i.images[0].url)){if(r===`json`)return{...i};if(r===`url`)return i.images[0].url;let e=await(await fetch(i.images[0].url)).blob();return r===`dataUrl`?y(e):e}throw new f(`Received malformed response from Fal.ai text-to-image API: expected { images: Array<{ url: string }> } result format, got instead: ${JSON.stringify(i)}`)}},et=class extends Ze{task;constructor(){super(`https://queue.fal.run`),this.task=`image-to-image`}preparePayload(e){let t=e.args;return e.mapping?.adapter===`lora`&&e.mapping.adapterWeightsPath&&(t.loras=[{path:Qe(e.mapping.hfModelId,e.mapping.adapterWeightsPath),scale:1}]),t}async preparePayloadAsync(e){let t=`data:${e.inputs instanceof Blob?e.inputs.type:`image/png`};base64,${v(new Uint8Array(e.inputs instanceof ArrayBuffer?e.inputs:await e.inputs.arrayBuffer()))}`;return{...b(e,[`inputs`,`parameters`]),image_url:t,...e.parameters,...e,image_urls:[t]}}async getResponse(e,t,n){let r=await this.getResponseFromQueueApi(e,t,n);if(typeof r==`object`&&r&&`images`in r&&Array.isArray(r.images)&&r.images.length>0&&typeof r.images[0]==`object`&&r.images[0]&&`url`in r.images[0]&&typeof r.images[0].url==`string`&&w(r.images[0].url))return await(await fetch(r.images[0].url)).blob();throw new f(`Received malformed response from Fal.ai image-to-image API: expected { images: Array<{ url: string }> } result format, got instead: ${JSON.stringify(r)}`)}},tt=class extends et{constructor(){super(),this.task=`image-text-to-image`}async preparePayloadAsync(e){return e.inputs?super.preparePayloadAsync(e):{...b(e,[`inputs`,`parameters`]),...e.parameters,prompt:e.parameters?.prompt,urlTransform:e=>{let t=new URL(e);return t.pathname=t.pathname.split(`/`).slice(0,-1).join(`/`),t.toString()}}}},nt=class extends Ze{task;constructor(){super(`https://queue.fal.run`),this.task=`text-to-video`}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs}}async getResponse(e,t,n){let r=await this.getResponseFromQueueApi(e,t,n);if(typeof r==`object`&&r&&`video`in r&&typeof r.video==`object`&&r.video&&`url`in r.video&&typeof r.video.url==`string`&&w(r.video.url))return await(await fetch(r.video.url)).blob();throw new f(`Received malformed response from Fal.ai text-to-video API: expected { video: { url: string } } result format, got instead: ${JSON.stringify(r)}`)}},rt=class extends Ze{task;constructor(){super(`https://queue.fal.run`),this.task=`image-to-video`}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,image_url:e.args.image_url}}async preparePayloadAsync(e){let t=e.inputs instanceof Blob?e.inputs.type:`image/png`;return{...b(e,[`inputs`,`parameters`]),image_url:`data:${t};base64,${v(new Uint8Array(e.inputs instanceof ArrayBuffer?e.inputs:await e.inputs.arrayBuffer()))}`,...e.parameters,...e}}async getResponse(e,t,n){let r=await this.getResponseFromQueueApi(e,t,n);if(typeof r==`object`&&r&&`video`in r&&typeof r.video==`object`&&r.video!==null&&`url`in r.video&&typeof r.video.url==`string`&&`url`in r.video&&w(r.video.url))return await(await fetch(r.video.url)).blob();throw new f(`Received malformed response from Fal.ai image‑to‑video API: expected { video: { url: string } }, got: ${JSON.stringify(r)}`)}},it=class extends rt{constructor(){super(),this.task=`image-text-to-video`}async preparePayloadAsync(e){return e.inputs?super.preparePayloadAsync(e):{...b(e,[`inputs`,`parameters`]),...e.parameters,prompt:e.parameters?.prompt,urlTransform:e=>{let t=new URL(e);return t.pathname=t.pathname.split(`/`).slice(0,-1).join(`/`),t.toString()}}}},at=class extends Xe{prepareHeaders(e,t){let n=super.prepareHeaders(e,t);return n[`Content-Type`]=`application/json`,n}async getResponse(e){let t=e;if(typeof t?.text!=`string`)throw new f(`Received malformed response from Fal.ai Automatic Speech Recognition API: expected { text: string } format, got instead: ${JSON.stringify(e)}`);return{text:t.text}}async preparePayloadAsync(e){let t=`data`in e&&e.data instanceof Blob?e.data:`inputs`in e?e.inputs:void 0,n=t?.type;if(!n)throw new s(`Unable to determine the input's content-type. Make sure your are passing a Blob when using provider fal-ai.`);if(!Ye.includes(n))throw new s(`Provider fal-ai does not support blob type ${n} - supported content types are: ${Ye.join(`, `)}`);let r=v(new Uint8Array(await t.arrayBuffer()));return{...`data`in e?b(e,`data`):b(e,`inputs`),audio_url:`data:${n};base64,${r}`}}},ot=class extends Xe{preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,text:e.args.inputs}}async getResponse(e){let t=e;if(typeof t?.audio?.url!=`string`)throw new f(`Received malformed response from Fal.ai Text-to-Speech API: expected { audio: { url: string } } format, got instead: ${JSON.stringify(e)}`);let n=await fetch(t.audio.url);if(!n.ok)throw new u(`Failed to fetch audio from ${t.audio.url}: ${n.statusText}`,{url:t.audio.url,method:`GET`,headers:{"Content-Type":`application/json`}},{requestId:n.headers.get(`x-request-id`)??``,status:n.status,body:await n.text()});try{return await n.blob()}catch(e){throw new u(`Failed to fetch audio from ${t.audio.url}: ${e instanceof Error?e.message:String(e)}`,{url:t.audio.url,method:`GET`,headers:{"Content-Type":`application/json`}},{requestId:n.headers.get(`x-request-id`)??``,status:n.status,body:await n.text()})}}},st=class extends Ze{task;constructor(){super(`https://queue.fal.run`),this.task=`image-segmentation`}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,sync_mode:!0}}async preparePayloadAsync(e){let t=`data`in e&&e.data instanceof Blob?e.data:`inputs`in e?e.inputs:void 0,n=t instanceof Blob?t.type:`image/png`,r=v(new Uint8Array(t instanceof ArrayBuffer?t:await t.arrayBuffer()));return{...b(e,[`inputs`,`parameters`,`data`]),...e.parameters,...e,image_url:`data:${n};base64,${r}`,sync_mode:!0}}async getResponse(e,t,n){let r=await this.getResponseFromQueueApi(e,t,n);if(typeof r==`object`&&r&&`image`in r&&typeof r.image==`object`&&r.image!==null&&`url`in r.image&&typeof r.image.url==`string`){let e=await fetch(r.image.url);if(!e.ok)throw new u(`Failed to fetch segmentation mask from ${r.image.url}`,{url:r.image.url,method:`GET`},{requestId:e.headers.get(`x-request-id`)??``,status:e.status,body:await e.text()});let t=await(await e.blob()).arrayBuffer();return[{label:`mask`,score:1,mask:v(new Uint8Array(t))}]}throw new f(`Received malformed response from Fal.ai image-segmentation API: expected { image: { url: string } } format, got instead: ${JSON.stringify(e)}`)}},ct=`https://api.featherless.ai`,lt=class extends h{constructor(){super(`featherless-ai`,ct)}},ut=class extends g{constructor(){super(`featherless-ai`,ct)}preparePayload(e){return{model:e.model,...b(e.args,[`inputs`,`parameters`]),...e.args.parameters?{max_tokens:e.args.parameters.max_new_tokens,...b(e.args.parameters,`max_new_tokens`)}:void 0,prompt:e.args.inputs}}async getResponse(e){if(typeof e==`object`&&`choices`in e&&Array.isArray(e?.choices)&&typeof e?.model==`string`)return{generated_text:e.choices[0].text};throw new f(`Received malformed response from Featherless AI text generation API`)}},dt=class extends h{constructor(){super(`fireworks-ai`,`https://api.fireworks.ai`)}makeRoute(){return`/inference/v1/chat/completions`}},ft=`https://api.groq.com`,pt=class extends g{constructor(){super(`groq`,ft)}makeRoute(){return`/openai/v1/chat/completions`}},mt=class extends h{constructor(){super(`groq`,ft)}makeRoute(){return`/openai/v1/chat/completions`}},ht=`https://api.hyperbolic.xyz`,gt=class extends h{constructor(){super(`hyperbolic`,ht)}},_t=class extends g{constructor(){super(`hyperbolic`,ht)}makeRoute(){return`v1/chat/completions`}preparePayload(e){return{messages:[{content:e.args.inputs,role:`user`}],...e.args.parameters?{max_tokens:e.args.parameters.max_new_tokens,...b(e.args.parameters,`max_new_tokens`)}:void 0,...b(e.args,[`inputs`,`parameters`]),model:e.model}}async getResponse(e){if(typeof e==`object`&&`choices`in e&&Array.isArray(e?.choices)&&typeof e?.model==`string`)return{generated_text:e.choices[0].message.content};throw new f(`Received malformed response from Hyperbolic text generation API`)}},vt=class extends m{constructor(){super(`hyperbolic`,ht)}makeRoute(e){return`/v1/images/generations`}preparePayload(e){if(e.outputType===`url`)throw new s(`hyperbolic provider does not support URL output. Use outputType 'blob', 'dataUrl' or 'json' instead.`);return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs,model_name:e.model}}async getResponse(e,t,n,r){if(typeof e==`object`&&`images`in e&&Array.isArray(e.images)&&e.images[0]&&typeof e.images[0].image==`string`)return r===`json`?{...e}:r===`dataUrl`?`data:image/jpeg;base64,${e.images[0].image}`:fetch(`data:image/jpeg;base64,${e.images[0].image}`).then(e=>e.blob());throw new f(`Received malformed response from Hyperbolic text-to-image API`)}},yt=`https://api.studio.nebius.ai`,bt=class extends h{constructor(){super(`nebius`,yt)}preparePayload(e){let t=super.preparePayload(e),n=e.args.response_format;return n?.type===`json_schema`&&n.json_schema?.schema&&(t.guided_json=n.json_schema.schema),t}},xt=class extends g{constructor(){super(`nebius`,yt)}preparePayload(e){return{...e.args,model:e.model,prompt:e.args.inputs}}async getResponse(e){if(typeof e==`object`&&`choices`in e&&Array.isArray(e?.choices)&&e.choices.length>0&&typeof e.choices[0]?.text==`string`)return{generated_text:e.choices[0].text};throw new f(`Received malformed response from Nebius text generation API`)}},St=class extends m{constructor(){super(`nebius`,yt)}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,response_format:e.outputType===`url`?`url`:`b64_json`,prompt:e.args.inputs,model:e.model}}makeRoute(){return`v1/images/generations`}async getResponse(e,t,n,r){if(typeof e==`object`&&`data`in e&&Array.isArray(e.data)&&e.data.length>0){if(r===`json`)return{...e};if(`url`in e.data[0]&&typeof e.data[0].url==`string`)return e.data[0].url;if(`b64_json`in e.data[0]&&typeof e.data[0].b64_json==`string`){let t=e.data[0].b64_json;return r===`dataUrl`?`data:image/jpeg;base64,${t}`:fetch(`data:image/jpeg;base64,${t}`).then(e=>e.blob())}}throw new f(`Received malformed response from Nebius text-to-image API`)}},Ct=class extends m{constructor(){super(`nebius`,yt)}preparePayload(e){return{input:e.args.inputs,model:e.model}}makeRoute(){return`v1/embeddings`}async getResponse(e){return e.data.map(e=>e.embedding)}},wt=`https://api.novita.ai`,Tt=class extends g{constructor(){super(`novita`,wt)}makeRoute(){return`/v3/openai/chat/completions`}},Et=class extends h{constructor(){super(`novita`,wt)}makeRoute(){return`/v3/openai/chat/completions`}},Dt=class extends m{constructor(){super(`novita`,wt)}makeRoute(e){return`/v3/async/${e.model}`}preparePayload(e){let{num_inference_steps:t,...n}=e.args.parameters??{};return{...b(e.args,[`inputs`,`parameters`]),...n,steps:t,prompt:e.args.inputs}}async getResponse(e,t,n){if(!t||!n)throw new s(`URL and headers are required for text-to-video task`);let r=e.task_id;if(!r)throw new f(`Received malformed response from Novita text-to-video API: no task ID found in the response`);let i=new URL(t),a=`${`${i.protocol}//${i.host}${i.host===`router.huggingface.co`?`/novita`:``}`}/v3/async/task-result?task_id=${r}`,o=``,c;for(;o!==`TASK_STATUS_SUCCEED`&&o!==`TASK_STATUS_FAILED`;){await Ve(500);let e=await fetch(a,{headers:n});if(!e.ok)throw new u(`Failed to fetch task result`,{url:a,method:`GET`,headers:n},{requestId:e.headers.get(`x-request-id`)??``,status:e.status,body:await e.text()});try{if(c=await e.json(),c&&typeof c==`object`&&`task`in c&&c.task&&typeof c.task==`object`&&`status`in c.task&&typeof c.task.status==`string`)o=c.task.status;else throw new f(`Received malformed response from Novita text-to-video API: failed to get task status`)}catch{throw new f(`Received malformed response from Novita text-to-video API: failed to parse task result`)}}if(o===`TASK_STATUS_FAILED`)throw new f(`Novita text-to-video task failed`);if(typeof c==`object`&&c&&`videos`in c&&typeof c.videos==`object`&&c.videos&&Array.isArray(c.videos)&&c.videos.length>0&&`video_url`in c.videos[0]&&typeof c.videos[0].video_url==`string`&&w(c.videos[0].video_url))return await(await fetch(c.videos[0].video_url)).blob();throw new f(`Received malformed response from Novita text-to-video API: expected { videos: [{ video_url: string }] } format, got instead: ${JSON.stringify(c)}`)}},Ot=`https://inference.api.nscale.com`,kt=class extends h{constructor(){super(`nscale`,Ot)}},At=class extends m{constructor(){super(`nscale`,Ot)}preparePayload(e){if(e.outputType===`url`)throw new s(`nscale provider does not support URL output. Use outputType 'blob', 'dataUrl' or 'json' instead.`);return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,response_format:`b64_json`,prompt:e.args.inputs,model:e.model}}makeRoute(){return`v1/images/generations`}async getResponse(e,t,n,r){if(typeof e==`object`&&`data`in e&&Array.isArray(e.data)&&e.data.length>0&&`b64_json`in e.data[0]&&typeof e.data[0].b64_json==`string`){if(r===`json`)return{...e};let t=e.data[0].b64_json;return r===`dataUrl`?`data:image/jpeg;base64,${t}`:fetch(`data:image/jpeg;base64,${t}`).then(e=>e.blob())}throw new f(`Received malformed response from Nscale text-to-image API`)}},jt=class extends h{constructor(){super(`nvidia`,`https://integrate.api.nvidia.com`)}},Mt=`https://api.openai.com`,Nt=class extends h{constructor(){super(`openai`,Mt,!0)}},Pt=`https://oai.endpoints.kepler.ai.cloud.ovh.net`,Ft=class extends h{constructor(){super(`ovhcloud`,Pt)}},It=class extends g{constructor(){super(`ovhcloud`,Pt)}preparePayload(e){return{model:e.model,...b(e.args,[`inputs`,`parameters`]),...e.args.parameters?{max_tokens:e.args.parameters.max_new_tokens,...b(e.args.parameters,`max_new_tokens`)}:void 0,prompt:e.args.inputs}}async getResponse(e){if(typeof e==`object`&&`choices`in e&&Array.isArray(e?.choices)&&typeof e?.model==`string`)return{generated_text:e.choices[0].text};throw new f(`Received malformed response from OVHcloud text generation API`)}},Lt=class extends h{constructor(){super(`publicai`,`https://api.publicai.co`)}},Rt=class extends m{constructor(e){super(`replicate`,e||`https://api.replicate.com`)}makeRoute(e){return e.model.includes(`:`)?`v1/predictions`:`v1/models/${e.model}/predictions`}preparePayload(e){return{input:{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs},version:e.model.includes(`:`)?e.model.split(`:`)[1]:void 0}}prepareHeaders(e,t){let n={Authorization:`Bearer ${e.accessToken}`,Prefer:`wait`};return t||(n[`Content-Type`]=`application/json`),n}makeUrl(e){let t=this.makeBaseUrl(e);return e.model.includes(`:`)?`${t}/v1/predictions`:`${t}/v1/models/${e.model}/predictions`}},zt=class extends Rt{preparePayload(e){return{input:{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs,lora_weights:e.mapping?.adapter===`lora`&&e.mapping.adapterWeightsPath?`https://huggingface.co/${e.mapping.hfModelId}`:void 0},version:e.model.includes(`:`)?e.model.split(`:`)[1]:void 0}}async getResponse(e,t,n,r){if(typeof e==`object`&&`output`in e&&typeof e.output==`string`&&w(e.output)){if(r===`json`)return{...e};if(r===`url`)return e.output;let t=await(await fetch(e.output)).blob();return r===`dataUrl`?y(t):t}if(typeof e==`object`&&`output`in e&&Array.isArray(e.output)&&e.output.length>0&&typeof e.output[0]==`string`){if(r===`json`)return{...e};if(r===`url`)return e.output[0];let t=await(await fetch(e.output[0])).blob();return r===`dataUrl`?y(t):t}throw new f(`Received malformed response from Replicate text-to-image API`)}},Bt=class extends Rt{preparePayload(e){let t=super.preparePayload(e),n=t.input;if(typeof n==`object`&&n&&`prompt`in n){let e=n;e.text=e.prompt,delete e.prompt}return t}async getResponse(e){if(e instanceof Blob)return e;if(e&&typeof e==`object`&&`output`in e){if(typeof e.output==`string`)return await(await fetch(e.output)).blob();if(Array.isArray(e.output))return await(await fetch(e.output[0])).blob()}throw new f(`Received malformed response from Replicate text-to-speech API`)}},Vt=class extends Rt{async getResponse(e){if(typeof e==`object`&&e&&`output`in e&&typeof e.output==`string`&&w(e.output))return await(await fetch(e.output)).blob();throw new f(`Received malformed response from Replicate text-to-video API`)}},Ht=class extends Rt{preparePayload(e){return{input:{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,audio:e.args.inputs},version:e.model.includes(`:`)?e.model.split(`:`)[1]:void 0}}async preparePayloadAsync(e){let t=`data`in e&&e.data instanceof Blob?e.data:`inputs`in e?e.inputs:void 0;if(!t||!(t instanceof Blob))throw Error(`Audio input must be a Blob`);let n=v(new Uint8Array(await t.arrayBuffer())),r=`data:${t.type||`audio/wav`};base64,${n}`;return{...`data`in e?b(e,`data`):b(e,`inputs`),inputs:r}}async getResponse(e){if(typeof e?.output==`string`)return{text:e.output};if(Array.isArray(e?.output)&&typeof e.output[0]==`string`)return{text:e.output[0]};let t=e?.output;if(t&&typeof t==`object`){if(typeof t.transcription==`string`)return{text:t.transcription};if(typeof t.translation==`string`)return{text:t.translation};if(typeof t.txt_file==`string`)return{text:await(await fetch(t.txt_file)).text()}}throw new f(`Received malformed response from Replicate automatic-speech-recognition API`)}},Ut=class extends Rt{preparePayload(e){let t=e.args.inputs;return{input:{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,image:t,images:[t],input_image:t,input_images:[t],lora_weights:e.mapping?.adapter===`lora`&&e.mapping.adapterWeightsPath?`https://huggingface.co/${e.mapping.hfModelId}`:void 0},version:e.model.includes(`:`)?e.model.split(`:`)[1]:void 0}}async preparePayloadAsync(e){let{inputs:t,...n}=e,r=v(new Uint8Array(await t.arrayBuffer())),i=`data:${t.type||`image/jpeg`};base64,${r}`;return{...n,inputs:i}}async getResponse(e){if(typeof e==`object`&&e&&`output`in e&&Array.isArray(e.output)&&e.output.length>0&&typeof e.output[0]==`string`)return await(await fetch(e.output[0])).blob();if(typeof e==`object`&&e&&`output`in e&&typeof e.output==`string`&&w(e.output))return await(await fetch(e.output)).blob();throw new f(`Received malformed response from Replicate image-to-image API`)}},Wt=class extends h{constructor(){super(`sambanova`,`https://api.sambanova.ai`)}preparePayload(e){let t=e.args.response_format;return t?.type===`json_schema`&&t.json_schema&&(t.json_schema.strict??!0)&&(t.json_schema.strict=!1),super.preparePayload(e)}},Gt=class extends m{constructor(){super(`sambanova`,`https://api.sambanova.ai`)}makeRoute(){return`/v1/embeddings`}async getResponse(e){if(typeof e==`object`&&`data`in e&&Array.isArray(e.data))return e.data.map(e=>e.embedding);throw new f(`Received malformed response from Sambanova feature-extraction (embeddings) API`)}preparePayload(e){return{model:e.model,input:e.args.inputs,...e.args}}},Kt=`https://api.scaleway.ai`,qt=class extends h{constructor(){super(`scaleway`,Kt)}},Jt=class extends g{constructor(){super(`scaleway`,Kt)}preparePayload(e){return{model:e.model,...e.args,prompt:e.args.inputs}}async getResponse(e){if(typeof e==`object`&&e&&`choices`in e&&Array.isArray(e.choices)&&e.choices.length>0){let t=e.choices[0];if(typeof t==`object`&&t&&`text`in t&&t.text&&typeof t.text==`string`)return{generated_text:t.text}}throw new f(`Received malformed response from Scaleway text generation API`)}},Yt=class extends m{constructor(){super(`scaleway`,Kt)}preparePayload(e){return{input:e.args.inputs,model:e.model}}makeRoute(){return`v1/embeddings`}async getResponse(e){return e.data.map(e=>e.embedding)}},Xt=`https://api.together.xyz`,Zt=class extends h{constructor(){super(`together`,Xt)}preparePayload(e){let t=super.preparePayload(e),n=t.response_format;return n?.type===`json_schema`&&n?.json_schema?.schema&&(t.response_format={type:`json_schema`,schema:n.json_schema.schema}),t}},Qt=class extends g{constructor(){super(`together`,Xt)}preparePayload(e){return{model:e.model,...e.args,prompt:e.args.inputs}}async getResponse(e){if(typeof e==`object`&&`choices`in e&&Array.isArray(e?.choices)&&typeof e?.model==`string`)return{generated_text:e.choices[0].text};throw new f(`Received malformed response from Together text generation API`)}},$t=class extends m{constructor(){super(`together`,Xt)}makeRoute(){return`v1/images/generations`}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,prompt:e.args.inputs,response_format:e.outputType===`url`?`url`:`base64`,model:e.model}}async getResponse(e,t,n,r){if(typeof e==`object`&&`data`in e&&Array.isArray(e.data)&&e.data.length>0){if(r===`json`)return{...e};if(`url`in e.data[0]&&typeof e.data[0].url==`string`)return e.data[0].url;if(`b64_json`in e.data[0]&&typeof e.data[0].b64_json==`string`){let t=e.data[0].b64_json;return r===`dataUrl`?`data:image/jpeg;base64,${t}`:fetch(`data:image/jpeg;base64,${t}`).then(e=>e.blob())}}throw new f(`Received malformed response from Together text-to-image API`)}},en=`https://api.wavespeed.ai`;async function tn(e,t){let n=v(new Uint8Array(e instanceof ArrayBuffer?e:await e.arrayBuffer()));return{base:n,images:Array.isArray(t)&&t.every(e=>typeof e==`string`)?t:[n]}}var nn=class extends m{constructor(e){super(`wavespeed`,e||en)}makeRoute(e){return`/api/v3/${e.model}`}preparePayload(e){let t={...b(e.args,[`inputs`,`parameters`]),...e.args.parameters?b(e.args.parameters,[`images`]):void 0,prompt:e.args.inputs};return e.mapping?.adapter===`lora`&&(t.loras=[{path:e.mapping.hfModelId,scale:1}]),t}async getResponse(e,t,n,r){if(!t||!n)throw new s(`Headers are required for WaveSpeed AI API calls`);let i=new URL(t),a=new URL(e.data.urls.get).pathname,o=`${`${i.protocol}//${i.host}${i.host===`router.huggingface.co`?`/wavespeed`:``}`}${a}`;for(;;){let e=await fetch(o,{headers:n});if(!e.ok)throw new u(`Failed to fetch response status from WaveSpeed AI API`,{url:o,method:`GET`},{requestId:e.headers.get(`x-request-id`)??``,status:e.status,body:await e.text()});let t=await e.json(),i=t.data;switch(i.status){case`completed`:{if(!i.outputs?.[0])throw new f(`Received malformed response from WaveSpeed AI API: No output URL in completed response`);let e=i.outputs[0];if(r===`url`)return e;if(r===`json`)return t;let n=await fetch(e);if(!n.ok)throw new u(`Failed to fetch generation output from WaveSpeed AI API`,{url:e,method:`GET`},{requestId:n.headers.get(`x-request-id`)??``,status:n.status,body:await n.text()});let a=await n.blob();return r===`dataUrl`?y(a):a}case`failed`:throw new f(i.error||`Task failed`);default:await Ve(500);continue}}}},rn=class extends nn{constructor(){super(en)}},an=class extends nn{constructor(){super(en)}async getResponse(e,t,n){return super.getResponse(e,t,n)}},on=class extends nn{constructor(){super(en)}async preparePayloadAsync(e){let t=e.images??e.parameters?.images,{base:n,images:r}=await tn(e.inputs,t);return{...e,inputs:e.parameters?.prompt,image:n,images:r}}async getResponse(e,t,n){return super.getResponse(e,t,n)}},sn=class extends nn{constructor(){super(en)}async preparePayloadAsync(e){let t=e.images??e.parameters?.images,{base:n,images:r}=await tn(e.inputs,t);return{...e,inputs:e.parameters?.prompt,image:n,images:r}}async getResponse(e,t,n){return super.getResponse(e,t,n)}},cn=`iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=`;function ln(){let e=Uint8Array.from(Buffer.from(cn,`base64`));return new Blob([e],{type:`image/png`})}var un=class extends on{constructor(){super()}async preparePayloadAsync(e){let t=e.inputs??ln();return super.preparePayloadAsync({...e,inputs:t})}},dn=class extends sn{constructor(){super()}async preparePayloadAsync(e){let t=e.inputs??ln();return super.preparePayloadAsync({...e,inputs:t})}},fn=`https://api.z.ai`,pn=class extends m{constructor(){super(`zai-org`,fn)}prepareHeaders(e,t){let n=super.prepareHeaders(e,t);return n[`x-source-channel`]=`hugging_face`,n[`accept-language`]=`en-US,en`,n}},mn=class extends h{constructor(){super(`zai-org`,fn)}prepareHeaders(e,t){let n=super.prepareHeaders(e,t);return n[`x-source-channel`]=`hugging_face`,n[`accept-language`]=`en-US,en`,n}makeRoute(){return`/api/paas/v4/chat/completions`}},hn=60,gn=5e3,_n=class extends pn{makeRoute(){return`/api/paas/v4/async/images/generations`}preparePayload(e){return{...b(e.args,[`inputs`,`parameters`]),...e.args.parameters,model:e.model,prompt:e.args.inputs}}async getResponse(e,t,n,r){if(!t||!n)throw new s(`URL and headers are required for 'text-to-image' task`);if(typeof e!=`object`||!e||!(`task_status`in e)||!(`id`in e)||typeof e.id!=`string`)throw new f(`Received malformed response from ZAI text-to-image API: expected { id: string, task_status: string }, got: ${JSON.stringify(e)}`);if(e.task_status===`FAIL`)throw new f(`ZAI API returned task status: FAIL`);let i=e.id,a=new URL(t),o=`${`${a.protocol}//${a.host}${a.host===`router.huggingface.co`?`/zai-org`:``}`}/api/paas/v4/async-result/${i}`,c={...n,"x-source-channel":`hugging_face`,"accept-language":`en-US,en`};for(let e=0;e<hn;e++){await Ve(gn);let e=await fetch(o,{method:`GET`,headers:c});if(!e.ok)throw new u(`Failed to fetch result from ZAI text-to-image API: ${e.status}`,{url:o,method:`GET`},{requestId:e.headers.get(`x-request-id`)??``,status:e.status,body:await e.text()});let t=await e.json();if(t.task_status===`FAIL`)throw new f(`ZAI text-to-image API task failed`);if(t.task_status===`SUCCESS`){if(!t.image_result||!Array.isArray(t.image_result)||t.image_result.length===0||typeof t.image_result[0]?.url!=`string`||!w(t.image_result[0].url))throw new f(`Received malformed response from ZAI text-to-image API: expected { image_result: Array<{ url: string }> }, got: ${JSON.stringify(t)}`);let e=t.image_result[0].url;if(r===`json`)return{...t};if(r===`url`)return e;let n=await(await fetch(e)).blob();return r===`dataUrl`?y(n):n}}throw new f(`Timed out while waiting for the result from ZAI API - aborting after ${hn} attempts`)}},vn=class extends pn{makeRoute(){return`/api/paas/v4/layout_parsing`}async preparePayloadAsync(e){let t=`data`in e&&e.data instanceof Blob?e.data:`inputs`in e?typeof e.inputs==`string`&&w(e.inputs)?await fetch(e.inputs).then(e=>e.blob()):e.inputs instanceof Blob?e.inputs:void 0:void 0;if(!t||!(t instanceof Blob))throw new s(`ZAI image-to-text requires a URL string or Blob as inputs`);let n=`data:${t.type||`image/png`};base64,${v(new Uint8Array(await t.arrayBuffer()))}`;return{...`data`in e?b(e,`data`):b(e,`inputs`),inputs:n}}preparePayload(e){return{model:e.model,file:e.args.inputs}}async getResponse(e){let t=e?.md_results;if(typeof t!=`string`)throw new f(`Received malformed response from ZAI layout_parsing API: expected { md_results: string }, got: ${JSON.stringify(e)}`);return{generated_text:t,generatedText:t}}},yn={baseten:{conversational:new Re},"black-forest-labs":{"text-to-image":new Ue},cerebras:{conversational:new We},clarifai:{conversational:new Be},cohere:{conversational:new Ge},deepinfra:{conversational:new qe,"text-generation":new Je},"fal-ai":{"automatic-speech-recognition":new at,"image-text-to-image":new tt,"image-text-to-video":new it,"image-to-image":new et,"image-segmentation":new st,"image-to-video":new rt,"text-to-image":new $e,"text-to-speech":new ot,"text-to-video":new nt},"featherless-ai":{conversational:new lt,"text-generation":new ut},"hf-inference":{"text-to-image":new re,conversational:new ie,"text-generation":new ae,"text-classification":new ge,"question-answering":new _e,"audio-classification":new oe,"automatic-speech-recognition":new se,"fill-mask":new ve,"feature-extraction":new ue,"image-classification":new S,"image-segmentation":new de,"document-question-answering":new le,"image-to-text":new fe,"object-detection":new me,"audio-to-audio":new ce,"zero-shot-image-classification":new he,"zero-shot-classification":new ye,"image-to-image":new pe,"sentence-similarity":new be,"table-question-answering":new xe,"tabular-classification":new Ee,"text-to-speech":new Te,"token-classification":new Se,translation:new Ce,summarization:new we,"visual-question-answering":new De,"tabular-regression":new Oe,"text-to-audio":new ke},"fireworks-ai":{conversational:new dt},groq:{conversational:new mt,"text-generation":new pt},hyperbolic:{"text-to-image":new vt,conversational:new gt,"text-generation":new _t},nebius:{"text-to-image":new St,conversational:new bt,"text-generation":new xt,"feature-extraction":new Ct},novita:{conversational:new Et,"text-generation":new Tt,"text-to-video":new Dt},nscale:{"text-to-image":new At,conversational:new kt},nvidia:{conversational:new jt},openai:{conversational:new Nt},ovhcloud:{conversational:new Ft,"text-generation":new It},publicai:{conversational:new Lt},replicate:{"text-to-image":new zt,"text-to-speech":new Bt,"text-to-video":new Vt,"image-to-image":new Ut,"automatic-speech-recognition":new Ht},sambanova:{conversational:new Wt,"feature-extraction":new Gt},scaleway:{conversational:new qt,"text-generation":new Jt,"feature-extraction":new Yt},together:{"text-to-image":new $t,conversational:new Zt,"text-generation":new Qt},wavespeed:{"text-to-image":new rn,"text-to-video":new an,"image-to-image":new on,"image-to-video":new sn,"image-text-to-image":new un,"image-text-to-video":new dn},"zai-org":{conversational:new mn,"text-to-image":new _n,"image-to-text":new vn}};function T(e,t){if(e===`hf-inference`&&!t||e===`auto`)return new x;if(!t)throw new s(`you need to provide a task name when using an external provider, e.g. 'text-to-image'`);if(!(e in yn))throw new s(`Provider '${e}' not supported. Available providers: ${Object.keys(yn)}`);let n=yn[e];if(!n||!(t in n))throw new s(`Task '${t}' not supported for provider '${e}'. Available tasks: ${Object.keys(n??{})}`);return n[t]}var bn=`4.13.15`,xn=`@huggingface/inference`,Sn=null;async function E(e,t,n){let{model:r}=e,i=t.provider,{task:a}=n??{};if(e.endpointUrl&&i!==`hf-inference`)throw new s(`Cannot use endpointUrl with a third-party provider.`);if(r&&w(r))throw new s(`Model URLs are no longer supported. Use endpointUrl instead.`);if(e.endpointUrl)return Cn(r??e.endpointUrl,t,e,void 0,n);if(!r&&!a)throw new s(`No model provided, and no task has been specified.`);let o=r??await wn(a);if(t.clientSideRoutingOnly&&!r)throw new s(`Provider ${i} requires a model ID to be passed directly.`);let c=t.clientSideRoutingOnly?{provider:i,providerId:En(r,i),hfModelId:r,status:`live`,task:a}:await Ie({modelId:o,task:a,provider:i,accessToken:e.accessToken},{fetch:n?.fetch});if(!c)throw new s(`We have not been able to find inference provider information for model ${o}.`);return Cn(c.providerId,t,e,c,n)}function Cn(e,t,n,r,a){let{accessToken:o,endpointUrl:c,provider:l,model:u,urlTransform:d,...f}=n,p=t.provider,{includeCredentials:m,task:h,signal:g,billTo:_,outputType:v}=a??{},y=(()=>{if(t.clientSideRoutingOnly&&o&&o.startsWith(`hf_`))throw new s(`Provider ${p} is closed-source and does not support HF tokens.`);return o?o.startsWith(`hf_`)?`hf-token`:`provider-key`:m===`include`?`credentials-include`:`none`})(),ee=c??e,te=t.makeUrl({authMethod:y,model:ee,task:h,urlTransform:d}),b=t.prepareHeaders({accessToken:o,authMethod:y},`data`in n&&!!n.data);_&&(b[i]=_),b[`User-Agent`]=[`${xn}/${bn}`,typeof navigator<`u`?navigator.userAgent:void 0].filter(e=>e!==void 0).join(` `);let ne=t.makeBody({args:f,model:e,task:h,mapping:r,outputType:v}),x;return typeof m==`string`?x=m:m===!0&&(x=`include`),{url:te,info:{headers:b,method:`POST`,body:ne,...x?{credentials:x}:void 0,signal:g}}}async function wn(e){Sn||=await Tn();let t=Sn[e];if((t?.models.length??0)<=0)throw new s(`No default model defined for task ${e}, please define the model explicitly.`);return t.models[0].id}async function Tn(){let e=`${t}/api/tasks`,n=await fetch(e);if(!n.ok)throw new d(`Failed to load tasks definitions from Hugging Face Hub.`,{url:e,method:`GET`},{requestId:n.headers.get(`x-request-id`)??``,status:n.status,body:await n.text()});return await n.json()}function En(e,t){if(!e.startsWith(`${t}/`))throw new s(`Models from ${t} must be prefixed by "${t}/". Got "${e}".`);return e.slice(t.length+1)}function Dn(e){let t,n,r,i=!1;return function(a){t===void 0?(t=a,n=0,r=-1):t=kn(t,a);let o=t.length,s=0;for(;n<o;){i&&=(t[n]===10&&(s=++n),!1);let a=-1;for(;n<o&&a===-1;++n)switch(t[n]){case 58:r===-1&&(r=n-s);break;case 13:i=!0;case 10:a=n;break}if(a===-1)break;e(t.subarray(s,a),r),s=n,r=-1}s===o?t=void 0:s!==0&&(t=t.subarray(s),n-=s)}}function On(e,t,n){let r=An(),i=new TextDecoder;return function(a,o){if(a.length===0)n?.(r),r=An();else if(o>0){let n=i.decode(a.subarray(0,o)),s=o+(a[o+1]===32?2:1),c=i.decode(a.subarray(s));switch(n){case`data`:r.data=r.data?r.data+`
`+c:c;break;case`event`:r.event=c;break;case`id`:e(r.id=c);break;case`retry`:{let e=parseInt(c,10);isNaN(e)||t(r.retry=e);break}}}}}function kn(e,t){let n=new Uint8Array(e.length+t.length);return n.set(e),n.set(t,e.length),n}function An(){return{data:``,event:``,id:``,retry:void 0}}function D(e){let t=null;if(e instanceof Blob||e instanceof ArrayBuffer)t=`[Blob or ArrayBuffer]`;else if(typeof e==`string`)try{t=JSON.parse(e)}catch{t=e}return t.accessToken&&=`[REDACTED]`,t}async function O(e,t,n){let{url:r,info:i}=await E(e,t,n),a=await(n?.fetch??fetch)(r,i),o={url:r,info:i};if(n?.retry_on_error!==!1&&a.status===503)return O(e,t,n);if(!a.ok){let t=a.headers.get(`Content-Type`);if([`application/json`,`application/problem+json`].some(e=>t?.startsWith(e))){let t=await a.json();throw[400,422,404,500].includes(a.status)&&n?.chatCompletion?new u(`Provider ${e.provider} does not seem to support chat completion for model ${e.model} . Error: ${JSON.stringify(t.error)}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t}):typeof t.error==`string`||typeof t.detail==`string`||typeof t.message==`string`?new u(`Failed to perform inference: ${t.error??t.detail??t.message}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t}):new u(`Failed to perform inference: an HTTP error occurred when requesting the provider.`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t})}let o=t?.startsWith(`text/plain;`)?await a.text():void 0;throw new u(`Failed to perform inference: ${o??`an HTTP error occurred when requesting the provider`}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:o??``})}return a.headers.get(`Content-Type`)?.startsWith(`application/json`)?{data:await a.json(),requestContext:o}:{data:await a.blob(),requestContext:o}}async function*jn(e,t,n){let{url:r,info:i}=await E({...e,stream:!0},t,n),a=await(n?.fetch??fetch)(r,i);if(n?.retry_on_error!==!1&&a.status===503)return yield*jn(e,t,n);if(!a.ok){if(a.headers.get(`Content-Type`)?.startsWith(`application/json`)){let t=await a.json();if([400,422,404,500].includes(a.status)&&n?.chatCompletion)throw new u(`Provider ${e.provider} does not seem to support chat completion for model ${e.model} . Error: ${JSON.stringify(t.error)}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t});if(typeof t.error==`string`)throw new u(`Failed to perform inference: ${t.error}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t});if(t.error&&`message`in t.error&&typeof t.error.message==`string`)throw new u(`Failed to perform inference: ${t.error.message}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t});if(typeof t.message==`string`)throw new u(`Failed to perform inference: ${t.message}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t})}throw new u(`Failed to perform inference: an HTTP error occurred when requesting the provider.`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:``})}if(!a.headers.get(`content-type`)?.startsWith(`text/event-stream`))throw new u(`Failed to perform inference: server does not support event stream content type, it returned `+a.headers.get(`content-type`),{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:``});if(!a.body)return;let o=a.body.getReader(),s=[],c=Dn(On(()=>{},()=>{},e=>{s.push(e)}));try{for(;;){let{done:e,value:t}=await o.read();if(e)return;c(t);for(let e of s)if(e.data.length>0){if(e.data===`[DONE]`)return;let t=JSON.parse(e.data);if(typeof t==`object`&&t&&`error`in t)throw new u(`Failed to perform inference: an occurred while streaming the response: ${typeof t.error==`string`?t.error:typeof t.error==`object`&&t.error&&`message`in t.error&&typeof t.error.message==`string`?t.error.message:JSON.stringify(t.error)}`,{url:r,method:i.method??`GET`,headers:i.headers,body:D(i.body)},{requestId:a.headers.get(`x-request-id`)??``,status:a.status,body:t});yield t}s=[]}}finally{o.releaseLock()}}async function Mn(e,t){return Me().warn(`The request method is deprecated and will be removed in a future version of huggingface.js. Use specific task functions instead.`),(await O(e,T(await C(e.provider,e.model,e.endpointUrl),t?.task),t)).data}async function*Nn(e,t){Me().warn(`The streamingRequest method is deprecated and will be removed in a future version of huggingface.js. Use specific task functions instead.`),yield*jn(e,T(await C(e.provider,e.model,e.endpointUrl),t?.task),t)}function Pn(e){return`data`in e?e:{...b(e,`inputs`),data:e.inputs}}async function Fn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`audio-classification`),{data:r}=await O(Pn(e),n,{...t,task:`audio-classification`});return n.getResponse(r)}async function In(e,t){let n=`inputs`in e?e.model:void 0,r=T(await C(e.provider,n),`audio-to-audio`),{data:i}=await O(Pn(e),r,{...t,task:`audio-to-audio`});return r.getResponse(i)}async function Ln(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`automatic-speech-recognition`),{data:r}=await O(await n.preparePayloadAsync(e),n,{...t,task:`automatic-speech-recognition`});return n.getResponse(r)}async function Rn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`text-to-speech`),{data:r}=await O(e,n,{...t,task:`text-to-speech`});return n.getResponse(r)}function zn(e){return`data`in e?e:{...b(e,`inputs`),data:e.inputs}}async function Bn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-classification`),{data:r}=await O(zn(e),n,{...t,task:`image-classification`});return n.getResponse(r)}async function Vn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-segmentation`),{data:r}=await O(await n.preparePayloadAsync(e),n,{...t,task:`image-segmentation`}),{url:i,info:a}=await E(e,n,{...t,task:`image-segmentation`});return n.getResponse(r,i,a.headers)}async function Hn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-to-image`),{data:r}=await O(await n.preparePayloadAsync(e),n,{...t,task:`image-to-image`}),{url:i,info:a}=await E(e,n,{...t,task:`image-to-image`});return n.getResponse(r,i,a.headers)}async function Un(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-to-text`),{data:r}=await O(await n.preparePayloadAsync(e),n,{...t,task:`image-to-text`});return n.getResponse(r)}async function Wn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-to-video`),{data:r}=await O(await n.preparePayloadAsync(e),n,{...t,task:`image-to-video`}),{url:i,info:a}=await E(e,n,{...t,task:`image-to-video`});return n.getResponse(r,i,a.headers)}async function Gn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-text-to-image`),{data:r,requestContext:i}=await O(await n.preparePayloadAsync(e),n,{...t,task:`image-text-to-image`});return n.getResponse(r,i.url,i.info.headers)}async function Kn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`image-text-to-video`),{data:r,requestContext:i}=await O(await n.preparePayloadAsync(e),n,{...t,task:`image-text-to-video`});return n.getResponse(r,i.url,i.info.headers)}async function qn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`object-detection`),{data:r}=await O(zn(e),n,{...t,task:`object-detection`});return n.getResponse(r)}async function Jn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`text-to-image`),{data:r}=await O(e,n,{...t,task:`text-to-image`}),{url:i,info:a}=await E(e,n,{...t,task:`text-to-image`});return n.getResponse(r,i,a.headers,t?.outputType)}async function Yn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`text-to-video`),{data:r}=await O(e,n,{...t,task:`text-to-video`}),{url:i,info:a}=await E(e,n,{...t,task:`text-to-video`});return n.getResponse(r,i,a.headers)}async function Xn(e){return e.inputs instanceof Blob?{...e,inputs:{image:v(new Uint8Array(await e.inputs.arrayBuffer()))}}:{...e,inputs:{image:v(new Uint8Array(e.inputs.image instanceof ArrayBuffer?e.inputs.image:await e.inputs.image.arrayBuffer()))}}}async function Zn(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`zero-shot-image-classification`),{data:r}=await O(await Xn(e),n,{...t,task:`zero-shot-image-classification`});return n.getResponse(r)}async function Qn(e,t){let n;n=e.endpointUrl?T(await C(e.provider,e.model,e.endpointUrl),`conversational`):!e.provider||e.provider===`auto`?new _:T(await C(e.provider,e.model,e.endpointUrl),`conversational`);let{data:r}=await O(e,n,{...t,task:`conversational`});return n.getResponse(r)}async function*$n(e,t){let n;n=e.endpointUrl?T(await C(e.provider,e.model,e.endpointUrl),`conversational`):!e.provider||e.provider===`auto`?new _:T(await C(e.provider,e.model,e.endpointUrl),`conversational`),yield*jn(e,n,{...t,task:`conversational`})}async function er(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`feature-extraction`),{data:r}=await O(e,n,{...t,task:`feature-extraction`});return n.getResponse(r)}async function tr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`fill-mask`),{data:r}=await O(e,n,{...t,task:`fill-mask`});return n.getResponse(r)}async function nr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`question-answering`),{data:r}=await O(e,n,{...t,task:`question-answering`});return n.getResponse(r)}async function rr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`sentence-similarity`),{data:r}=await O(e,n,{...t,task:`sentence-similarity`});return n.getResponse(r)}async function ir(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`summarization`),{data:r}=await O(e,n,{...t,task:`summarization`});return n.getResponse(r)}async function ar(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`table-question-answering`),{data:r}=await O(e,n,{...t,task:`table-question-answering`});return n.getResponse(r)}async function or(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`text-classification`),{data:r}=await O(e,n,{...t,task:`text-classification`});return n.getResponse(r)}async function sr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`text-generation`),{data:r}=await O(e,n,{...t,task:`text-generation`});return n.getResponse(r)}async function*cr(e,t){yield*jn(e,T(await C(e.provider,e.model,e.endpointUrl),`text-generation`),{...t,task:`text-generation`})}async function lr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`token-classification`),{data:r}=await O(e,n,{...t,task:`token-classification`});return n.getResponse(r)}async function ur(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`translation`),{data:r}=await O(e,n,{...t,task:`translation`});return n.getResponse(r)}async function dr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`zero-shot-classification`),{data:r}=await O(e,n,{...t,task:`zero-shot-classification`});return n.getResponse(r)}async function fr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`document-question-answering`),{data:r}=await O({...e,inputs:{question:e.inputs.question,image:v(new Uint8Array(await e.inputs.image.arrayBuffer()))}},n,{...t,task:`document-question-answering`});return n.getResponse(r)}async function pr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`visual-question-answering`),{data:r}=await O({...e,inputs:{question:e.inputs.question,image:v(new Uint8Array(await e.inputs.image.arrayBuffer()))}},n,{...t,task:`visual-question-answering`});return n.getResponse(r)}async function mr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`tabular-classification`),{data:r}=await O(e,n,{...t,task:`tabular-classification`});return n.getResponse(r)}async function hr(e,t){let n=T(await C(e.provider,e.model,e.endpointUrl),`tabular-regression`),{data:r}=await O(e,n,{...t,task:`tabular-regression`});return n.getResponse(r)}var gr=e({audioClassification:()=>Fn,audioToAudio:()=>In,automaticSpeechRecognition:()=>Ln,chatCompletion:()=>Qn,chatCompletionStream:()=>$n,documentQuestionAnswering:()=>fr,featureExtraction:()=>er,fillMask:()=>tr,imageClassification:()=>Bn,imageSegmentation:()=>Vn,imageTextToImage:()=>Gn,imageTextToVideo:()=>Kn,imageToImage:()=>Hn,imageToText:()=>Un,imageToVideo:()=>Wn,objectDetection:()=>qn,questionAnswering:()=>nr,request:()=>Mn,sentenceSimilarity:()=>rr,streamingRequest:()=>Nn,summarization:()=>ir,tableQuestionAnswering:()=>ar,tabularClassification:()=>mr,tabularRegression:()=>hr,textClassification:()=>or,textGeneration:()=>sr,textGenerationStream:()=>cr,textToImage:()=>Jn,textToSpeech:()=>Rn,textToVideo:()=>Yn,tokenClassification:()=>lr,translation:()=>ur,visualQuestionAnswering:()=>pr,zeroShotClassification:()=>dr,zeroShotImageClassification:()=>Zn});function _r(e){return Object.entries(e)}var vr=class e{accessToken;defaultOptions;constructor(e=``,t={}){this.accessToken=e,this.defaultOptions=t;for(let[n,r]of _r(gr))Object.defineProperty(this,n,{enumerable:!1,value:(n,i)=>r({endpointUrl:t.endpointUrl,accessToken:e,...n},{...b(t,[`endpointUrl`]),...i})})}endpoint(t){return new e(this.accessToken,{...this.defaultOptions,endpointUrl:t})}},yr=class extends vr{},br=class extends vr{},xr=[`baseten`,`black-forest-labs`,`cerebras`,`clarifai`,`cohere`,`deepinfra`,`fal-ai`,`featherless-ai`,`fireworks-ai`,`groq`,`hf-inference`,`hyperbolic`,`nebius`,`novita`,`nscale`,`nvidia`,`openai`,`ovhcloud`,`publicai`,`replicate`,`sambanova`,`scaleway`,`together`,`wavespeed`,`zai-org`],Sr=[...xr,`auto`],Cr={baseten:`baseten`,"black-forest-labs":`black-forest-labs`,cerebras:`cerebras`,clarifai:`clarifai`,cohere:`CohereLabs`,deepinfra:`DeepInfra`,"fal-ai":`fal`,"featherless-ai":`featherless-ai`,"fireworks-ai":`fireworks-ai`,groq:`groq`,"hf-inference":`hf-inference`,hyperbolic:`Hyperbolic`,nebius:`nebius`,novita:`novita`,nscale:`nscale`,nvidia:`nvidia`,openai:`openai`,ovhcloud:`ovhcloud`,publicai:`publicai`,replicate:`replicate`,sambanova:`sambanovasystems`,scaleway:`scaleway`,together:`togethercomputer`,wavespeed:`wavespeed`,"zai-org":`zai-org`},wr=Object.defineProperty,Tr=(e,t,n)=>t in e?wr(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n,Er=(e,t,n)=>(Tr(e,typeof t==`symbol`?t:t+``,n),n),k=Object.freeze({Text:`Text`,NumericLiteral:`NumericLiteral`,StringLiteral:`StringLiteral`,Identifier:`Identifier`,Equals:`Equals`,OpenParen:`OpenParen`,CloseParen:`CloseParen`,OpenStatement:`OpenStatement`,CloseStatement:`CloseStatement`,OpenExpression:`OpenExpression`,CloseExpression:`CloseExpression`,OpenSquareBracket:`OpenSquareBracket`,CloseSquareBracket:`CloseSquareBracket`,OpenCurlyBracket:`OpenCurlyBracket`,CloseCurlyBracket:`CloseCurlyBracket`,Comma:`Comma`,Dot:`Dot`,Colon:`Colon`,Pipe:`Pipe`,CallOperator:`CallOperator`,AdditiveBinaryOperator:`AdditiveBinaryOperator`,MultiplicativeBinaryOperator:`MultiplicativeBinaryOperator`,ComparisonBinaryOperator:`ComparisonBinaryOperator`,UnaryOperator:`UnaryOperator`,Comment:`Comment`}),A=class{constructor(e,t){this.value=e,this.type=t}};function Dr(e){return/\w/.test(e)}function Or(e){return/[0-9]/.test(e)}function kr(e){return/\s/.test(e)}var Ar=[[`{%`,k.OpenStatement],[`%}`,k.CloseStatement],[`{{`,k.OpenExpression],[`}}`,k.CloseExpression],[`(`,k.OpenParen],[`)`,k.CloseParen],[`{`,k.OpenCurlyBracket],[`}`,k.CloseCurlyBracket],[`[`,k.OpenSquareBracket],[`]`,k.CloseSquareBracket],[`,`,k.Comma],[`.`,k.Dot],[`:`,k.Colon],[`|`,k.Pipe],[`<=`,k.ComparisonBinaryOperator],[`>=`,k.ComparisonBinaryOperator],[`==`,k.ComparisonBinaryOperator],[`!=`,k.ComparisonBinaryOperator],[`<`,k.ComparisonBinaryOperator],[`>`,k.ComparisonBinaryOperator],[`+`,k.AdditiveBinaryOperator],[`-`,k.AdditiveBinaryOperator],[`~`,k.AdditiveBinaryOperator],[`*`,k.MultiplicativeBinaryOperator],[`/`,k.MultiplicativeBinaryOperator],[`%`,k.MultiplicativeBinaryOperator],[`=`,k.Equals]],jr=new Map([[`n`,`
`],[`t`,`	`],[`r`,`\r`],[`b`,`\b`],[`f`,`\f`],[`v`,`\v`],[`'`,`'`],[`"`,`"`],[`\\`,`\\`]]);function Mr(e,t={}){return e.endsWith(`
`)&&(e=e.slice(0,-1)),t.lstrip_blocks&&(e=e.replace(/^[ \t]*({[#%-])/gm,`$1`)),t.trim_blocks&&(e=e.replace(/([#%-]})\n/g,`$1`)),e.replace(/{%\s*(end)?generation\s*%}/gs,``)}function Nr(e,t={}){let n=[],r=Mr(e,t),i=0,a=0,o=e=>{let t=``;for(;e(r[i]);){if(r[i]===`\\`){if(++i,i>=r.length)throw SyntaxError(`Unexpected end of input`);let e=r[i++],n=jr.get(e);if(n===void 0)throw SyntaxError(`Unexpected escaped character: ${e}`);t+=n;continue}if(t+=r[i++],i>=r.length)throw SyntaxError(`Unexpected end of input`)}return t},s=()=>{let e=n.at(-1);e&&e.type===k.Text&&(e.value=e.value.trimEnd(),e.value===``&&n.pop())},c=()=>{for(;i<r.length&&kr(r[i]);)++i};main:for(;i<r.length;){let e=n.at(-1)?.type;if(e===void 0||e===k.CloseStatement||e===k.CloseExpression||e===k.Comment){let e=``;for(;i<r.length&&!(r[i]===`{`&&(r[i+1]===`%`||r[i+1]===`{`||r[i+1]===`#`));)e+=r[i++];if(e.length>0){n.push(new A(e,k.Text));continue}}if(r[i]===`{`&&r[i+1]===`#`){i+=2;let e=r[i]===`-`;e&&++i;let t=``;for(;r[i]!==`#`||r[i+1]!==`}`;){if(i+2>=r.length)throw SyntaxError(`Missing end of comment tag`);t+=r[i++]}let a=t.endsWith(`-`);a&&(t=t.slice(0,-1)),e&&s(),n.push(new A(t,k.Comment)),i+=2,a&&c();continue}if(r.slice(i,i+3)===`{%-`){s(),n.push(new A(`{%`,k.OpenStatement)),i+=3;continue}if(r.slice(i,i+3)===`{{-`){s(),n.push(new A(`{{`,k.OpenExpression)),a=0,i+=3;continue}if(o(kr),r.slice(i,i+3)===`-%}`){n.push(new A(`%}`,k.CloseStatement)),i+=3,c();continue}if(r.slice(i,i+3)===`-}}`){n.push(new A(`}}`,k.CloseExpression)),i+=3,c();continue}let t=r[i];if(t===`-`||t===`+`){let e=n.at(-1)?.type;if(e===k.Text||e===void 0)throw SyntaxError(`Unexpected character: ${t}`);switch(e){case k.Identifier:case k.NumericLiteral:case k.StringLiteral:case k.CloseParen:case k.CloseSquareBracket:break;default:{++i;let e=o(Or);n.push(new A(`${t}${e}`,e.length>0?k.NumericLiteral:k.UnaryOperator));continue}}}for(let[e,t]of Ar)if(!(e===`}}`&&a>0)&&r.slice(i,i+e.length)===e){n.push(new A(e,t)),t===k.OpenExpression?a=0:t===k.OpenCurlyBracket?++a:t===k.CloseCurlyBracket&&--a,i+=e.length;continue main}if(t===`'`||t===`"`){++i;let e=o(e=>e!==t);n.push(new A(e,k.StringLiteral)),++i;continue}if(Or(t)){let e=o(Or);if(r[i]===`.`&&Or(r[i+1])){++i;let t=o(Or);e=`${e}.${t}`}n.push(new A(e,k.NumericLiteral));continue}if(Dr(t)){let e=o(Dr);n.push(new A(e,k.Identifier));continue}throw SyntaxError(`Unexpected character: ${t}`)}return n}var j=class{type=`Statement`},Pr=class extends j{constructor(e){super(),this.body=e}type=`Program`},Fr=class extends j{constructor(e,t,n){super(),this.test=e,this.body=t,this.alternate=n}type=`If`},Ir=class extends j{constructor(e,t,n,r){super(),this.loopvar=e,this.iterable=t,this.body=n,this.defaultBlock=r}type=`For`},Lr=class extends j{type=`Break`},Rr=class extends j{type=`Continue`},zr=class extends j{constructor(e,t,n){super(),this.assignee=e,this.value=t,this.body=n}type=`Set`},Br=class extends j{constructor(e,t,n){super(),this.name=e,this.args=t,this.body=n}type=`Macro`},Vr=class extends j{constructor(e){super(),this.value=e}type=`Comment`},M=class extends j{type=`Expression`},Hr=class extends M{constructor(e,t,n){super(),this.object=e,this.property=t,this.computed=n}type=`MemberExpression`},Ur=class extends M{constructor(e,t){super(),this.callee=e,this.args=t}type=`CallExpression`},Wr=class extends M{constructor(e){super(),this.value=e}type=`Identifier`},Gr=class extends M{constructor(e){super(),this.value=e}type=`Literal`},Kr=class extends Gr{type=`IntegerLiteral`},qr=class extends Gr{type=`FloatLiteral`},Jr=class extends Gr{type=`StringLiteral`},Yr=class extends Gr{type=`ArrayLiteral`},Xr=class extends Gr{type=`TupleLiteral`},Zr=class extends Gr{type=`ObjectLiteral`},Qr=class extends M{constructor(e,t,n){super(),this.operator=e,this.left=t,this.right=n}type=`BinaryExpression`},$r=class extends M{constructor(e,t){super(),this.operand=e,this.filter=t}type=`FilterExpression`},ei=class extends j{constructor(e,t){super(),this.filter=e,this.body=t}type=`FilterStatement`},ti=class extends M{constructor(e,t){super(),this.lhs=e,this.test=t}type=`SelectExpression`},ni=class extends M{constructor(e,t,n){super(),this.operand=e,this.negate=t,this.test=n}type=`TestExpression`},ri=class extends M{constructor(e,t){super(),this.operator=e,this.argument=t}type=`UnaryExpression`},ii=class extends M{constructor(e=void 0,t=void 0,n=void 0){super(),this.start=e,this.stop=t,this.step=n}type=`SliceExpression`},ai=class extends M{constructor(e,t){super(),this.key=e,this.value=t}type=`KeywordArgumentExpression`},oi=class extends M{constructor(e){super(),this.argument=e}type=`SpreadExpression`},si=class extends j{constructor(e,t,n){super(),this.call=e,this.callerArgs=t,this.body=n}type=`CallStatement`},ci=class extends M{constructor(e,t,n){super(),this.condition=e,this.trueExpr=t,this.falseExpr=n}type=`Ternary`};function li(e){let t=new Pr([]),n=0;function r(t,r){let i=e[n++];if(!i||i.type!==t)throw Error(`Parser Error: ${r}. ${i.type} !== ${t}.`);return i}function i(e){if(!c(e))throw SyntaxError(`Expected ${e}`);++n}function a(){switch(e[n].type){case k.Comment:return new Vr(e[n++].value);case k.Text:return l();case k.OpenStatement:return u();case k.OpenExpression:return d();default:throw SyntaxError(`Unexpected token type: ${e[n].type}`)}}function o(...t){return n+t.length<=e.length&&t.every((t,r)=>t===e[n+r].type)}function s(...t){return e[n]?.type===k.OpenStatement&&e[n+1]?.type===k.Identifier&&t.includes(e[n+1]?.value)}function c(...t){return n+t.length<=e.length&&t.every((t,r)=>e[n+r].type===`Identifier`&&t===e[n+r].value)}function l(){return new Jr(r(k.Text,`Expected text token`).value)}function u(){if(r(k.OpenStatement,`Expected opening statement token`),e[n].type!==k.Identifier)throw SyntaxError(`Unknown statement, got ${e[n].type}`);let t=e[n].value,c;switch(t){case`set`:++n,c=f();break;case`if`:++n,c=p(),r(k.OpenStatement,`Expected {% token`),i(`endif`),r(k.CloseStatement,`Expected %} token`);break;case`macro`:++n,c=m(),r(k.OpenStatement,`Expected {% token`),i(`endmacro`),r(k.CloseStatement,`Expected %} token`);break;case`for`:++n,c=g(),r(k.OpenStatement,`Expected {% token`),i(`endfor`),r(k.CloseStatement,`Expected %} token`);break;case`call`:{++n;let e=null;o(k.OpenParen)&&(e=ie());let t=S();if(t.type!==`Identifier`)throw SyntaxError(`Expected identifier following call statement`);let l=ie();r(k.CloseStatement,`Expected closing statement token`);let u=[];for(;!s(`endcall`);)u.push(a());r(k.OpenStatement,`Expected '{%'`),i(`endcall`),r(k.CloseStatement,`Expected closing statement token`),c=new si(new Ur(t,l),e,u);break}case`break`:++n,r(k.CloseStatement,`Expected closing statement token`),c=new Lr;break;case`continue`:++n,r(k.CloseStatement,`Expected closing statement token`),c=new Rr;break;case`filter`:{++n;let e=S();e instanceof Wr&&o(k.OpenParen)&&(e=re(e)),r(k.CloseStatement,`Expected closing statement token`);let t=[];for(;!s(`endfilter`);)t.push(a());r(k.OpenStatement,`Expected '{%'`),i(`endfilter`),r(k.CloseStatement,`Expected '%}'`),c=new ei(e,t);break}default:throw SyntaxError(`Unknown statement type: ${t}`)}return c}function d(){r(k.OpenExpression,`Expected opening expression token`);let e=_();return r(k.CloseExpression,`Expected closing expression token`),e}function f(){let e=h(),t=null,c=[];if(o(k.Equals))++n,t=h();else{for(r(k.CloseStatement,`Expected %} token`);!s(`endset`);)c.push(a());r(k.OpenStatement,`Expected {% token`),i(`endset`)}return r(k.CloseStatement,`Expected closing statement token`),new zr(e,t,c)}function p(){let e=_();r(k.CloseStatement,`Expected closing statement token`);let t=[],i=[];for(;!s(`elif`,`else`,`endif`);)t.push(a());if(s(`elif`)){++n,++n;let e=p();i.push(e)}else if(s(`else`))for(++n,++n,r(k.CloseStatement,`Expected closing statement token`);!s(`endif`);)i.push(a());return new Fr(e,t,i)}function m(){let e=S();if(e.type!==`Identifier`)throw SyntaxError(`Expected identifier following macro statement`);let t=ie();r(k.CloseStatement,`Expected closing statement token`);let n=[];for(;!s(`endmacro`);)n.push(a());return new Br(e,t,n)}function h(e=!1){let t=e?S:_,r=[t()],i=o(k.Comma);for(;i&&(++n,r.push(t()),o(k.Comma)););return i?new Xr(r):r[0]}function g(){let e=h(!0);if(!(e instanceof Wr||e instanceof Xr))throw SyntaxError(`Expected identifier/tuple for the loop variable, got ${e.type} instead`);if(!c(`in`))throw SyntaxError("Expected `in` keyword following loop variable");++n;let t=_();r(k.CloseStatement,`Expected closing statement token`);let i=[];for(;!s(`endfor`,`else`);)i.push(a());let o=[];if(s(`else`))for(++n,++n,r(k.CloseStatement,`Expected closing statement token`);!s(`endfor`);)o.push(a());return new Ir(e,t,i,o)}function _(){return v()}function v(){let e=y();if(c(`if`)){++n;let t=y();return c(`else`)?(++n,new ci(t,e,v())):new ti(e,t)}return e}function y(){let t=ee();for(;c(`or`);){let r=e[n];++n;let i=ee();t=new Qr(r,t,i)}return t}function ee(){let t=te();for(;c(`and`);){let r=e[n];++n;let i=te();t=new Qr(r,t,i)}return t}function te(){let t;for(;c(`not`);){let r=e[n];++n,t=new ri(r,te())}return t??b()}function b(){let t=ne();for(;;){let r;if(c(`not`,`in`))r=new A(`not in`,k.Identifier),n+=2;else if(c(`in`))r=e[n++];else if(o(k.ComparisonBinaryOperator))r=e[n++];else break;let i=ne();t=new Qr(r,t,i)}return t}function ne(){let t=ce();for(;o(k.AdditiveBinaryOperator);){let r=e[n];++n;let i=ce();t=new Qr(r,t,i)}return t}function x(){let e=se(S());return o(k.OpenParen)?re(e):e}function re(e){let t=new Ur(e,ie());return t=se(t),o(k.OpenParen)&&(t=re(t)),t}function ie(){r(k.OpenParen,`Expected opening parenthesis for arguments list`);let e=ae();return r(k.CloseParen,`Expected closing parenthesis for arguments list`),e}function ae(){let t=[];for(;!o(k.CloseParen);){let r;if(e[n].type===k.MultiplicativeBinaryOperator&&e[n].value===`*`)++n,r=new oi(_());else if(r=_(),o(k.Equals)){if(++n,!(r instanceof Wr))throw SyntaxError(`Expected identifier for keyword argument`);let e=_();r=new ai(r,e)}t.push(r),o(k.Comma)&&++n}return t}function oe(){let e=[],t=!1;for(;!o(k.CloseSquareBracket);)o(k.Colon)?(e.push(void 0),++n,t=!0):(e.push(_()),o(k.Colon)&&(++n,t=!0));if(e.length===0)throw SyntaxError(`Expected at least one argument for member/slice expression`);if(t){if(e.length>3)throw SyntaxError(`Expected 0-3 arguments for slice expression`);return new ii(...e)}return e[0]}function se(t){for(;o(k.Dot)||o(k.OpenSquareBracket);){let i=e[n];++n;let a,o=i.type===k.OpenSquareBracket;if(o)a=oe(),r(k.CloseSquareBracket,`Expected closing square bracket`);else if(a=S(),a.type!==`Identifier`)throw SyntaxError(`Expected identifier following dot operator`);t=new Hr(t,a,o)}return t}function ce(){let t=le();for(;o(k.MultiplicativeBinaryOperator);){let r=e[n++],i=le();t=new Qr(r,t,i)}return t}function le(){let e=ue();for(;c(`is`);){++n;let t=c(`not`);t&&++n;let r=S();if(!(r instanceof Wr))throw SyntaxError(`Expected identifier for the test`);e=new ni(e,t,r)}return e}function ue(){let e=x();for(;o(k.Pipe);){++n;let t=S();if(!(t instanceof Wr))throw SyntaxError(`Expected identifier for the filter`);o(k.OpenParen)&&(t=re(t)),e=new $r(e,t)}return e}function S(){let t=e[n++];switch(t.type){case k.NumericLiteral:{let e=t.value;return e.includes(`.`)?new qr(Number(e)):new Kr(Number(e))}case k.StringLiteral:{let r=t.value;for(;o(k.StringLiteral);)r+=e[n++].value;return new Jr(r)}case k.Identifier:return new Wr(t.value);case k.OpenParen:{let e=h();return r(k.CloseParen,"Expected closing parenthesis, got ${tokens[current].type} instead."),e}case k.OpenSquareBracket:{let e=[];for(;!o(k.CloseSquareBracket);)e.push(_()),o(k.Comma)&&++n;return++n,new Yr(e)}case k.OpenCurlyBracket:{let e=new Map;for(;!o(k.CloseCurlyBracket);){let t=_();r(k.Colon,`Expected colon between key and value in object literal`);let i=_();e.set(t,i),o(k.Comma)&&++n}return++n,new Zr(e)}default:throw SyntaxError(`Unexpected token: ${t.type}`)}}for(;n<e.length;)t.body.push(a());return t}function ui(e,t,n=1){if(t===void 0&&(t=e,e=0),n===0)throw Error(`range() step must not be zero`);let r=[];if(n>0)for(let i=e;i<t;i+=n)r.push(i);else for(let i=e;i>t;i+=n)r.push(i);return r}function di(e,t,n,r=1){let i=Math.sign(r);i>=0?(t=(t??=0)<0?Math.max(e.length+t,0):Math.min(t,e.length),n=(n??=e.length)<0?Math.max(e.length+n,0):Math.min(n,e.length)):(t=(t??=e.length-1)<0?Math.max(e.length+t,-1):Math.min(t,e.length-1),n=(n??=-1)<-1?Math.max(e.length+n,-1):Math.min(n,e.length-1));let a=[];for(let o=t;i*o<i*n;o+=r)a.push(e[o]);return a}function fi(e){return e.replace(/\b\w/g,e=>e.toUpperCase())}function pi(e){return mi(new Date,e)}function mi(e,t){let n=new Intl.DateTimeFormat(void 0,{month:`long`}),r=new Intl.DateTimeFormat(void 0,{month:`short`}),i=e=>e<10?`0`+e:e.toString();return t.replace(/%[YmdbBHM%]/g,t=>{switch(t){case`%Y`:return e.getFullYear().toString();case`%m`:return i(e.getMonth()+1);case`%d`:return i(e.getDate());case`%b`:return r.format(e);case`%B`:return n.format(e);case`%H`:return i(e.getHours());case`%M`:return i(e.getMinutes());case`%%`:return`%`;default:return t}})}function hi(e){return e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`)}function gi(e,t,n,r){if(r===0)return e;let i=r==null||r<0?1/0:r,a=t.length===0?RegExp(`(?=)`,`gu`):new RegExp(hi(t),`gu`);return e.replaceAll(a,e=>i>0?(--i,n):e)}var _i=class extends Error{},vi=class extends Error{},yi=new Map,N=class{type=`RuntimeValue`;value;get builtins(){return yi}constructor(e=void 0){this.value=e}__bool__(){return new L(!!this.value)}toString(){return String(this.value)}},P=class extends N{type=`IntegerValue`},F=class extends N{type=`FloatValue`;toString(){return this.value%1==0?this.value.toFixed(1):this.value.toString()}},I=class extends N{type=`StringValue`;_builtins;get builtins(){return this._builtins??=new Map([[`upper`,new B(()=>new I(this.value.toUpperCase()))],[`lower`,new B(()=>new I(this.value.toLowerCase()))],[`strip`,new B(()=>new I(this.value.trim()))],[`title`,new B(()=>new I(fi(this.value)))],[`capitalize`,new B(()=>new I(this.value.charAt(0).toUpperCase()+this.value.slice(1)))],[`length`,new P(this.value.length)],[`rstrip`,new B(()=>new I(this.value.trimEnd()))],[`lstrip`,new B(()=>new I(this.value.trimStart()))],[`startswith`,new B(e=>{if(e.length===0)throw Error(`startswith() requires at least one argument`);let t=e[0];if(t instanceof I)return new L(this.value.startsWith(t.value));if(t instanceof z){for(let e of t.value){if(!(e instanceof I))throw Error(`startswith() tuple elements must be strings`);if(this.value.startsWith(e.value))return new L(!0)}return new L(!1)}throw Error(`startswith() argument must be a string or tuple of strings`)})],[`endswith`,new B(e=>{if(e.length===0)throw Error(`endswith() requires at least one argument`);let t=e[0];if(t instanceof I)return new L(this.value.endsWith(t.value));if(t instanceof z){for(let e of t.value){if(!(e instanceof I))throw Error(`endswith() tuple elements must be strings`);if(this.value.endsWith(e.value))return new L(!0)}return new L(!1)}throw Error(`endswith() argument must be a string or tuple of strings`)})],[`split`,new B(e=>{let t=e[0]??new V;if(!(t instanceof I||t instanceof V))throw Error(`sep argument must be a string or null`);let n=e[1]??new P(-1);if(!(n instanceof P))throw Error(`maxsplit argument must be a number`);let r=[];if(t instanceof V){let e=this.value.trimStart();for(let{0:t,index:i}of e.matchAll(/\S+/g)){if(n.value!==-1&&r.length>=n.value&&i!==void 0){r.push(t+e.slice(i+t.length));break}r.push(t)}}else{if(t.value===``)throw Error(`empty separator`);r=this.value.split(t.value),n.value!==-1&&r.length>n.value&&r.push(r.splice(n.value).join(t.value))}return new z(r.map(e=>new I(e)))})],[`replace`,new B(e=>{if(e.length<2)throw Error(`replace() requires at least two arguments`);let t=e[0],n=e[1];if(!(t instanceof I&&n instanceof I))throw Error(`replace() arguments must be strings`);let r;if(r=e.length>2?e[2].type===`KeywordArgumentsValue`?e[2].value.get(`count`)??new V:e[2]:new V,!(r instanceof P||r instanceof V))throw Error(`replace() count argument must be a number or null`);return new I(gi(this.value,t.value,n.value,r.value))})]])}},L=class extends N{type=`BooleanValue`},bi=/[\x7f-\uffff]/g;function xi(e){return e.replace(bi,e=>`\\u`+e.charCodeAt(0).toString(16).padStart(4,`0`))}function Si(e,t={},n=0,r=!0){let{indent:i=null,ensureAscii:a=!1,separators:o=null,sortKeys:s=!1}=t,c,l;switch(o?[c,l]=o:i?(c=`,`,l=`: `):(c=`, `,l=`: `),e.type){case`NullValue`:return`null`;case`UndefinedValue`:return r?`null`:`undefined`;case`IntegerValue`:case`FloatValue`:case`BooleanValue`:return JSON.stringify(e.value);case`StringValue`:{let t=JSON.stringify(e.value);return a&&(t=xi(t)),t}case`ArrayValue`:case`ObjectValue`:{let o=i?` `.repeat(i):``,u=`
`+o.repeat(n),d=u+o;if(e.type===`ArrayValue`){let a=e.value.map(e=>Si(e,t,n+1,r));return i?`[${d}${a.join(`${c}${d}`)}${u}]`:`[${a.join(c)}]`}else{let o=Array.from(e.value.entries());s&&(o=o.sort(([e],[t])=>e.localeCompare(t)));let f=o.map(([e,o])=>{let s=JSON.stringify(e);a&&(s=xi(s));let c=`${s}${l}${Si(o,t,n+1,r)}`;return i?`${d}${c}`:c});return i?`{${f.join(c)}${u}}`:`{${f.join(c)}}`}}default:throw Error(`Cannot convert to JSON: ${e.type}`)}}var R=class extends N{type=`ObjectValue`;_builtins;__bool__(){return new L(this.value.size>0)}get builtins(){return this._builtins??=new Map([[`get`,new B(([e,t])=>{if(!(e instanceof I))throw Error(`Object key must be a string: got ${e.type}`);return this.value.get(e.value)??t??new V})],[`items`,new B(()=>this.items())],[`keys`,new B(()=>this.keys())],[`values`,new B(()=>this.values())],[`dictsort`,new B(e=>{let t=new Map,n=e.filter(e=>e instanceof Ci?(t=e.value,!1):!0),r=n.at(0)??t.get(`case_sensitive`)??new L(!1);if(!(r instanceof L))throw Error(`case_sensitive must be a boolean`);let i=n.at(1)??t.get(`by`)??new I(`key`);if(!(i instanceof I))throw Error(`by must be a string`);if(![`key`,`value`].includes(i.value))throw Error(`by must be either 'key' or 'value'`);let a=n.at(2)??t.get(`reverse`)??new L(!1);if(!(a instanceof L))throw Error(`reverse must be a boolean`);return new z(Array.from(this.value.entries()).map(([e,t])=>new z([new I(e),t])).sort((e,t)=>{let n=i.value===`key`?0:1,o=e.value[n],s=t.value[n],c=Oi(o,s,r.value);return a.value?-c:c}))})]])}items(){return new z(Array.from(this.value.entries()).map(([e,t])=>new z([new I(e),t])))}keys(){return new z(Array.from(this.value.keys()).map(e=>new I(e)))}values(){return new z(Array.from(this.value.values()))}toString(){return Si(this,{},0,!1)}},Ci=class extends R{type=`KeywordArgumentsValue`},z=class extends N{type=`ArrayValue`;_builtins;get builtins(){return this._builtins??=new Map([[`length`,new P(this.value.length)]])}__bool__(){return new L(this.value.length>0)}toString(){return Si(this,{},0,!1)}},wi=class extends z{type=`TupleValue`},B=class extends N{type=`FunctionValue`},V=class extends N{type=`NullValue`},H=class extends N{type=`UndefinedValue`},Ti=class{constructor(e){this.parent=e}variables=new Map([[`namespace`,new B(e=>{if(e.length===0)return new R(new Map);if(e.length!==1||!(e[0]instanceof R))throw Error("`namespace` expects either zero arguments or a single object argument");return e[0]})]]);tests=Ti.TESTS;set(e,t){return this.declareVariable(e,Ai(t))}declareVariable(e,t){if(this.variables.has(e))throw SyntaxError(`Variable already declared: ${e}`);return this.variables.set(e,t),t}setVariable(e,t){return this.variables.set(e,t),t}resolve(e){if(this.variables.has(e))return this;if(this.parent)return this.parent.resolve(e);throw Error(`Unknown variable: ${e}`)}lookupVariable(e){try{return this.resolve(e).variables.get(e)??new H}catch{return new H}}},U=Ti;Er(U,`TESTS`,new Map([[`boolean`,e=>e.type===`BooleanValue`],[`callable`,e=>e instanceof B],[`odd`,e=>{if(!(e instanceof P))throw Error(`cannot odd on ${e.type}`);return e.value%2!=0}],[`even`,e=>{if(!(e instanceof P))throw Error(`cannot even on ${e.type}`);return e.value%2==0}],[`false`,e=>e.type===`BooleanValue`&&!e.value],[`true`,e=>e.type===`BooleanValue`&&e.value],[`none`,e=>e.type===`NullValue`],[`string`,e=>e.type===`StringValue`],[`number`,e=>e instanceof P||e instanceof F],[`integer`,e=>e instanceof P],[`iterable`,e=>e.type===`ArrayValue`||e.type===`StringValue`],[`mapping`,e=>e instanceof R],[`sequence`,e=>e instanceof z||e instanceof R||e instanceof I],[`lower`,e=>{let t=e.value;return e.type===`StringValue`&&t===t.toLowerCase()}],[`upper`,e=>{let t=e.value;return e.type===`StringValue`&&t===t.toUpperCase()}],[`none`,e=>e.type===`NullValue`],[`defined`,e=>e.type!==`UndefinedValue`],[`undefined`,e=>e.type===`UndefinedValue`],[`equalto`,(e,t)=>e.value===t.value],[`eq`,(e,t)=>e.value===t.value]]));function Ei(e){e.set(`false`,!1),e.set(`true`,!0),e.set(`none`,null),e.set(`raise_exception`,e=>{throw Error(e)}),e.set(`range`,ui),e.set(`strftime_now`,pi),e.set(`True`,!0),e.set(`False`,!1),e.set(`None`,null)}function Di(e,t){let n=t.split(`.`),r=e;for(let e of n)if(r instanceof R)r=r.value.get(e)??new H;else if(r instanceof z){let t=parseInt(e,10);if(!isNaN(t)&&t>=0&&t<r.value.length)r=r.value[t];else return new H}else return new H;return r}function Oi(e,t,n=!1){if(e instanceof V&&t instanceof V)return 0;if(e instanceof V||t instanceof V)throw Error(`Cannot compare ${e.type} with ${t.type}`);if(e instanceof H&&t instanceof H)return 0;if(e instanceof H||t instanceof H)throw Error(`Cannot compare ${e.type} with ${t.type}`);let r=e=>e instanceof P||e instanceof F||e instanceof L,i=e=>e instanceof L?+!!e.value:e.value;if(r(e)&&r(t)){let n=i(e),r=i(t);return n<r?-1:+(n>r)}if(e.type!==t.type)throw Error(`Cannot compare different types: ${e.type} and ${t.type}`);switch(e.type){case`StringValue`:{let r=e.value,i=t.value;return n||(r=r.toLowerCase(),i=i.toLowerCase()),r<i?-1:+(r>i)}default:throw Error(`Cannot compare type: ${e.type}`)}}var ki=class{global;constructor(e){this.global=e??new U}run(e){return this.evaluate(e,this.global)}evaluateBinaryExpression(e,t){let n=this.evaluate(e.left,t);switch(e.operator.value){case`and`:return n.__bool__().value?this.evaluate(e.right,t):n;case`or`:return n.__bool__().value?n:this.evaluate(e.right,t)}let r=this.evaluate(e.right,t);switch(e.operator.value){case`==`:return new L(n.value==r.value);case`!=`:return new L(n.value!=r.value)}if(n instanceof H||r instanceof H){if(r instanceof H&&[`in`,`not in`].includes(e.operator.value))return new L(e.operator.value===`not in`);throw Error(`Cannot perform operation ${e.operator.value} on undefined values`)}else if(n instanceof V||r instanceof V)throw Error(`Cannot perform operation on null values`);else if(e.operator.value===`~`)return new I(n.value.toString()+r.value.toString());else if((n instanceof P||n instanceof F)&&(r instanceof P||r instanceof F)){let t=n.value,i=r.value;switch(e.operator.value){case`+`:case`-`:case`*`:{let a=e.operator.value===`+`?t+i:e.operator.value===`-`?t-i:t*i;return n instanceof F||r instanceof F?new F(a):new P(a)}case`/`:return new F(t/i);case`%`:{let e=t%i;return n instanceof F||r instanceof F?new F(e):new P(e)}case`<`:return new L(t<i);case`>`:return new L(t>i);case`>=`:return new L(t>=i);case`<=`:return new L(t<=i)}}else if(n instanceof z&&r instanceof z)switch(e.operator.value){case`+`:return new z(n.value.concat(r.value))}else if(r instanceof z){let t=r.value.find(e=>e.value===n.value)!==void 0;switch(e.operator.value){case`in`:return new L(t);case`not in`:return new L(!t)}}if(n instanceof I||r instanceof I)switch(e.operator.value){case`+`:return new I(n.value.toString()+r.value.toString())}if(n instanceof I&&r instanceof I)switch(e.operator.value){case`in`:return new L(r.value.includes(n.value));case`not in`:return new L(!r.value.includes(n.value))}if(n instanceof I&&r instanceof R)switch(e.operator.value){case`in`:return new L(r.value.has(n.value));case`not in`:return new L(!r.value.has(n.value))}throw SyntaxError(`Unknown operator "${e.operator.value}" between ${n.type} and ${r.type}`)}evaluateArguments(e,t){let n=[],r=new Map;for(let i of e)if(i.type===`SpreadExpression`){let e=i,r=this.evaluate(e.argument,t);if(!(r instanceof z))throw Error(`Cannot unpack non-iterable type: ${r.type}`);for(let e of r.value)n.push(e)}else if(i.type===`KeywordArgumentExpression`){let e=i;r.set(e.key.value,this.evaluate(e.value,t))}else{if(r.size>0)throw Error(`Positional arguments must come before keyword arguments`);n.push(this.evaluate(i,t))}return[n,r]}applyFilter(e,t,n){if(t.type===`Identifier`){let r=t;if(r.value===`safe`)return e;if(r.value===`tojson`)return new I(Si(e,{}));if(e instanceof z)switch(r.value){case`list`:return e;case`first`:return e.value[0];case`last`:return e.value[e.value.length-1];case`length`:return new P(e.value.length);case`reverse`:return new z(e.value.slice().reverse());case`sort`:return new z(e.value.slice().sort((e,t)=>Oi(e,t,!1)));case`join`:return new I(e.value.map(e=>e.value).join(``));case`string`:return new I(Si(e,{},0,!1));case`unique`:{let t=new Set,n=[];for(let r of e.value)t.has(r.value)||(t.add(r.value),n.push(r));return new z(n)}default:throw Error(`Unknown ArrayValue filter: ${r.value}`)}else if(e instanceof I)switch(r.value){case`length`:case`upper`:case`lower`:case`title`:case`capitalize`:{let t=e.builtins.get(r.value);if(t instanceof B)return t.value([],n);if(t instanceof P)return t;throw Error(`Unknown StringValue filter: ${r.value}`)}case`trim`:return new I(e.value.trim());case`indent`:return new I(e.value.split(`
`).map((e,t)=>t===0||e.length===0?e:`    `+e).join(`
`));case`join`:case`string`:return e;case`int`:{let t=parseInt(e.value,10);return new P(isNaN(t)?0:t)}case`float`:{let t=parseFloat(e.value);return new F(isNaN(t)?0:t)}default:throw Error(`Unknown StringValue filter: ${r.value}`)}else if(e instanceof P||e instanceof F)switch(r.value){case`abs`:return e instanceof P?new P(Math.abs(e.value)):new F(Math.abs(e.value));case`int`:return new P(Math.floor(e.value));case`float`:return new F(e.value);case`string`:return new I(e.toString());default:throw Error(`Unknown NumericValue filter: ${r.value}`)}else if(e instanceof R)switch(r.value){case`items`:return new z(Array.from(e.value.entries()).map(([e,t])=>new z([new I(e),t])));case`length`:return new P(e.value.size);default:{let t=e.builtins.get(r.value);if(t)return t instanceof B?t.value([],n):t;throw Error(`Unknown ObjectValue filter: ${r.value}`)}}else if(e instanceof L)switch(r.value){case`bool`:return new L(e.value);case`int`:return new P(+!!e.value);case`float`:return new F(+!!e.value);case`string`:return new I(e.value?`true`:`false`);default:throw Error(`Unknown BooleanValue filter: ${r.value}`)}throw Error(`Cannot apply filter "${r.value}" to type: ${e.type}`)}else if(t.type===`CallExpression`){let r=t;if(r.callee.type!==`Identifier`)throw Error(`Unknown filter: ${r.callee.type}`);let i=r.callee.value;if(i===`tojson`){let[,t]=this.evaluateArguments(r.args,n),i=t.get(`indent`)??new V;if(!(i instanceof P||i instanceof V))throw Error(`If set, indent must be a number`);let a=t.get(`ensure_ascii`)??new L(!1);if(!(a instanceof L))throw Error(`If set, ensure_ascii must be a boolean`);let o=t.get(`sort_keys`)??new L(!1);if(!(o instanceof L))throw Error(`If set, sort_keys must be a boolean`);let s=t.get(`separators`)??new V,c=null;if(s instanceof z||s instanceof wi){if(s.value.length!==2)throw Error(`separators must be a tuple of two strings`);let[e,t]=s.value;if(!(e instanceof I)||!(t instanceof I))throw Error(`separators must be a tuple of two strings`);c=[e.value,t.value]}else if(!(s instanceof V))throw Error(`If set, separators must be a tuple of two strings`);return new I(Si(e,{indent:i.value,ensureAscii:a.value,sortKeys:o.value,separators:c}))}else if(i===`join`){let t;if(e instanceof I)t=Array.from(e.value);else if(e instanceof z)t=e.value.map(e=>e.value);else throw Error(`Cannot apply filter "${i}" to type: ${e.type}`);let[a,o]=this.evaluateArguments(r.args,n),s=a.at(0)??o.get(`separator`)??new I(``);if(!(s instanceof I))throw Error(`separator must be a string`);return new I(t.join(s.value))}else if(i===`int`||i===`float`){let[t,a]=this.evaluateArguments(r.args,n),o=t.at(0)??a.get(`default`)??(i===`int`?new P(0):new F(0));if(e instanceof I){let t=i===`int`?parseInt(e.value,10):parseFloat(e.value);return isNaN(t)?o:i===`int`?new P(t):new F(t)}else if(e instanceof P||e instanceof F)return e;else if(e instanceof L)return i===`int`?new P(+!!e.value):new F(+!!e.value);else throw Error(`Cannot apply filter "${i}" to type: ${e.type}`)}else if(i===`default`){let[t,i]=this.evaluateArguments(r.args,n),a=t[0]??new I(``),o=t[1]??i.get(`boolean`)??new L(!1);if(!(o instanceof L))throw Error("`default` filter flag must be a boolean");return e instanceof H||o.value&&!e.__bool__().value?a:e}if(e instanceof z){switch(i){case`sort`:{let[t,i]=this.evaluateArguments(r.args,n),a=t.at(0)??i.get(`reverse`)??new L(!1);if(!(a instanceof L))throw Error(`reverse must be a boolean`);let o=t.at(1)??i.get(`case_sensitive`)??new L(!1);if(!(o instanceof L))throw Error(`case_sensitive must be a boolean`);let s=t.at(2)??i.get(`attribute`)??new V;if(!(s instanceof I||s instanceof P||s instanceof V))throw Error(`attribute must be a string, integer, or null`);let c=e=>s instanceof V?e:Di(e,s instanceof P?String(s.value):s.value);return new z(e.value.slice().sort((e,t)=>{let n=Oi(c(e),c(t),o.value);return a.value?-n:n}))}case`selectattr`:case`rejectattr`:{let t=i===`selectattr`;if(e.value.some(e=>!(e instanceof R)))throw Error(`\`${i}\` can only be applied to array of objects`);if(r.args.some(e=>e.type!==`StringLiteral`))throw Error(`arguments of \`${i}\` must be strings`);let[a,o,s]=r.args.map(e=>this.evaluate(e,n)),c;if(o){let e=n.tests.get(o.value);if(!e)throw Error(`Unknown test: ${o.value}`);c=e}else c=(...e)=>e[0].__bool__().value;return new z(e.value.filter(e=>{let n=e.value.get(a.value),r=n?c(n,s):!1;return t?r:!r}))}case`map`:{let[,t]=this.evaluateArguments(r.args,n);if(t.has(`attribute`)){let n=t.get(`attribute`);if(!(n instanceof I))throw Error(`attribute must be a string`);let r=t.get(`default`);return new z(e.value.map(e=>{if(!(e instanceof R))throw Error(`items in map must be an object`);let t=Di(e,n.value);return t instanceof H?r??new H:t}))}else throw Error("`map` expressions without `attribute` set are not currently supported.")}}throw Error(`Unknown ArrayValue filter: ${i}`)}else if(e instanceof I){switch(i){case`indent`:{let[t,i]=this.evaluateArguments(r.args,n),a=t.at(0)??i.get(`width`)??new P(4);if(!(a instanceof P))throw Error(`width must be a number`);let o=t.at(1)??i.get(`first`)??new L(!1),s=t.at(2)??i.get(`blank`)??new L(!1),c=e.value.split(`
`),l=` `.repeat(a.value);return new I(c.map((e,t)=>!o.value&&t===0||!s.value&&e.length===0?e:l+e).join(`
`))}case`replace`:{let t=e.builtins.get(`replace`);if(!(t instanceof B))throw Error(`replace filter not available`);let[i,a]=this.evaluateArguments(r.args,n);return t.value([...i,new Ci(a)],n)}}throw Error(`Unknown StringValue filter: ${i}`)}else if(e instanceof R){let t=e.builtins.get(i);if(t&&t instanceof B){let[e,i]=this.evaluateArguments(r.args,n);return i.size>0&&e.push(new Ci(i)),t.value(e,n)}throw Error(`Unknown ObjectValue filter: ${i}`)}else throw Error(`Cannot apply filter "${i}" to type: ${e.type}`)}throw Error(`Unknown filter: ${t.type}`)}evaluateFilterExpression(e,t){let n=this.evaluate(e.operand,t);return this.applyFilter(n,e.filter,t)}evaluateTestExpression(e,t){let n=this.evaluate(e.operand,t),r=t.tests.get(e.test.value);if(!r)throw Error(`Unknown test: ${e.test.value}`);let i=r(n);return new L(e.negate?!i:i)}evaluateSelectExpression(e,t){return this.evaluate(e.test,t).__bool__().value?this.evaluate(e.lhs,t):new H}evaluateUnaryExpression(e,t){let n=this.evaluate(e.argument,t);switch(e.operator.value){case`not`:return new L(!n.value);default:throw SyntaxError(`Unknown operator: ${e.operator.value}`)}}evaluateTernaryExpression(e,t){return this.evaluate(e.condition,t).__bool__().value?this.evaluate(e.trueExpr,t):this.evaluate(e.falseExpr,t)}evalProgram(e,t){return this.evaluateBlock(e.body,t)}evaluateBlock(e,t){let n=``;for(let r of e){let e=this.evaluate(r,t);e.type!==`NullValue`&&e.type!==`UndefinedValue`&&(n+=e.toString())}return new I(n)}evaluateIdentifier(e,t){return t.lookupVariable(e.value)}evaluateCallExpression(e,t){let[n,r]=this.evaluateArguments(e.args,t);r.size>0&&n.push(new Ci(r));let i=this.evaluate(e.callee,t);if(i.type!==`FunctionValue`)throw Error(`Cannot call something that is not a function: got ${i.type}`);return i.value(n,t)}evaluateSliceExpression(e,t,n){if(!(e instanceof z||e instanceof I))throw Error(`Slice object must be an array or string`);let r=this.evaluate(t.start,n),i=this.evaluate(t.stop,n),a=this.evaluate(t.step,n);if(!(r instanceof P||r instanceof H))throw Error(`Slice start must be numeric or undefined`);if(!(i instanceof P||i instanceof H))throw Error(`Slice stop must be numeric or undefined`);if(!(a instanceof P||a instanceof H))throw Error(`Slice step must be numeric or undefined`);return e instanceof z?new z(di(e.value,r.value,i.value,a.value)):new I(di(Array.from(e.value),r.value,i.value,a.value).join(``))}evaluateMemberExpression(e,t){let n=this.evaluate(e.object,t),r;if(e.computed){if(e.property.type===`SliceExpression`)return this.evaluateSliceExpression(n,e.property,t);r=this.evaluate(e.property,t)}else r=new I(e.property.value);let i;if(n instanceof R){if(!(r instanceof I))throw Error(`Cannot access property with non-string: got ${r.type}`);i=n.value.get(r.value)??n.builtins.get(r.value)}else if(n instanceof z||n instanceof I)if(r instanceof P)i=n.value.at(r.value),n instanceof I&&(i=new I(n.value.at(r.value)));else if(r instanceof I)i=n.builtins.get(r.value);else throw Error(`Cannot access property with non-string/non-number: got ${r.type}`);else{if(!(r instanceof I))throw Error(`Cannot access property with non-string: got ${r.type}`);i=n.builtins.get(r.value)}return i instanceof N?i:new H}evaluateSet(e,t){let n=e.value?this.evaluate(e.value,t):this.evaluateBlock(e.body,t);if(e.assignee.type===`Identifier`){let r=e.assignee.value;t.setVariable(r,n)}else if(e.assignee.type===`TupleLiteral`){let r=e.assignee;if(!(n instanceof z))throw Error(`Cannot unpack non-iterable type in set: ${n.type}`);let i=n.value;if(i.length!==r.value.length)throw Error(`Too ${r.value.length>i.length?`few`:`many`} items to unpack in set`);for(let e=0;e<r.value.length;++e){let n=r.value[e];if(n.type!==`Identifier`)throw Error(`Cannot unpack to non-identifier in set: ${n.type}`);t.setVariable(n.value,i[e])}}else if(e.assignee.type===`MemberExpression`){let r=e.assignee,i=this.evaluate(r.object,t);if(!(i instanceof R))throw Error(`Cannot assign to member of non-object`);if(r.property.type!==`Identifier`)throw Error(`Cannot assign to member with non-identifier property`);i.value.set(r.property.value,n)}else throw Error(`Invalid LHS inside assignment expression: ${JSON.stringify(e.assignee)}`);return new V}evaluateIf(e,t){let n=this.evaluate(e.test,t);return this.evaluateBlock(n.__bool__().value?e.body:e.alternate,t)}evaluateFor(e,t){let n=new U(t),r,i;if(e.iterable.type===`SelectExpression`){let t=e.iterable;i=this.evaluate(t.lhs,n),r=t.test}else i=this.evaluate(e.iterable,n);if(!(i instanceof z||i instanceof R))throw Error(`Expected iterable or object type in for loop: got ${i.type}`);i instanceof R&&(i=i.keys());let a=[],o=[];for(let t=0;t<i.value.length;++t){let s=new U(n),c=i.value[t],l;if(e.loopvar.type===`Identifier`)l=t=>t.setVariable(e.loopvar.value,c);else if(e.loopvar.type===`TupleLiteral`){let t=e.loopvar;if(c.type!==`ArrayValue`)throw Error(`Cannot unpack non-iterable type: ${c.type}`);let n=c;if(t.value.length!==n.value.length)throw Error(`Too ${t.value.length>n.value.length?`few`:`many`} items to unpack`);l=e=>{for(let r=0;r<t.value.length;++r){if(t.value[r].type!==`Identifier`)throw Error(`Cannot unpack non-identifier type: ${t.value[r].type}`);e.setVariable(t.value[r].value,n.value[r])}}}else throw Error(`Invalid loop variable(s): ${e.loopvar.type}`);r&&(l(s),!this.evaluate(r,s).__bool__().value)||(a.push(c),o.push(l))}let s=``,c=!0;for(let t=0;t<a.length;++t){let r=new Map([[`index`,new P(t+1)],[`index0`,new P(t)],[`revindex`,new P(a.length-t)],[`revindex0`,new P(a.length-t-1)],[`first`,new L(t===0)],[`last`,new L(t===a.length-1)],[`length`,new P(a.length)],[`previtem`,t>0?a[t-1]:new H],[`nextitem`,t<a.length-1?a[t+1]:new H]]);n.setVariable(`loop`,new R(r)),o[t](n);try{let t=this.evaluateBlock(e.body,n);s+=t.value}catch(e){if(e instanceof vi)continue;if(e instanceof _i)break;throw e}c=!1}if(c){let t=this.evaluateBlock(e.defaultBlock,n);s+=t.value}return new I(s)}evaluateMacro(e,t){return t.setVariable(e.name.value,new B((t,n)=>{let r=new U(n);t=t.slice();let i;t.at(-1)?.type===`KeywordArgumentsValue`&&(i=t.pop());for(let n=0;n<e.args.length;++n){let a=e.args[n],o=t[n];if(a.type===`Identifier`){let e=a;if(!o)throw Error(`Missing positional argument: ${e.value}`);r.setVariable(e.value,o)}else if(a.type===`KeywordArgumentExpression`){let e=a,t=o??i?.value.get(e.key.value)??this.evaluate(e.value,r);r.setVariable(e.key.value,t)}else throw Error(`Unknown argument type: ${a.type}`)}return this.evaluateBlock(e.body,r)})),new V}evaluateCallStatement(e,t){let n=new B((t,n)=>{let r=new U(n);if(e.callerArgs)for(let n=0;n<e.callerArgs.length;++n){let i=e.callerArgs[n];if(i.type!==`Identifier`)throw Error(`Caller parameter must be an identifier, got ${i.type}`);r.setVariable(i.value,t[n]??new H)}return this.evaluateBlock(e.body,r)}),[r,i]=this.evaluateArguments(e.call.args,t);r.push(new Ci(i));let a=this.evaluate(e.call.callee,t);if(a.type!==`FunctionValue`)throw Error(`Cannot call something that is not a function: got ${a.type}`);let o=new U(t);return o.setVariable(`caller`,n),a.value(r,o)}evaluateFilterStatement(e,t){let n=this.evaluateBlock(e.body,t);return this.applyFilter(n,e.filter,t)}evaluate(e,t){if(!e)return new H;switch(e.type){case`Program`:return this.evalProgram(e,t);case`Set`:return this.evaluateSet(e,t);case`If`:return this.evaluateIf(e,t);case`For`:return this.evaluateFor(e,t);case`Macro`:return this.evaluateMacro(e,t);case`CallStatement`:return this.evaluateCallStatement(e,t);case`Break`:throw new _i;case`Continue`:throw new vi;case`IntegerLiteral`:return new P(e.value);case`FloatLiteral`:return new F(e.value);case`StringLiteral`:return new I(e.value);case`ArrayLiteral`:return new z(e.value.map(e=>this.evaluate(e,t)));case`TupleLiteral`:return new wi(e.value.map(e=>this.evaluate(e,t)));case`ObjectLiteral`:{let n=new Map;for(let[r,i]of e.value){let e=this.evaluate(r,t);if(!(e instanceof I))throw Error(`Object keys must be strings: got ${e.type}`);n.set(e.value,this.evaluate(i,t))}return new R(n)}case`Identifier`:return this.evaluateIdentifier(e,t);case`CallExpression`:return this.evaluateCallExpression(e,t);case`MemberExpression`:return this.evaluateMemberExpression(e,t);case`UnaryExpression`:return this.evaluateUnaryExpression(e,t);case`BinaryExpression`:return this.evaluateBinaryExpression(e,t);case`FilterExpression`:return this.evaluateFilterExpression(e,t);case`FilterStatement`:return this.evaluateFilterStatement(e,t);case`TestExpression`:return this.evaluateTestExpression(e,t);case`SelectExpression`:return this.evaluateSelectExpression(e,t);case`Ternary`:return this.evaluateTernaryExpression(e,t);case`Comment`:return new V;default:throw SyntaxError(`Unknown node type: ${e.type}`)}}};function Ai(e){switch(typeof e){case`number`:return Number.isInteger(e)?new P(e):new F(e);case`string`:return new I(e);case`boolean`:return new L(e);case`undefined`:return new H;case`object`:return e===null?new V:Array.isArray(e)?new z(e.map(Ai)):new R(new Map(Object.entries(e).map(([e,t])=>[e,Ai(t)])));case`function`:return new B((t,n)=>Ai(e(...t.map(e=>e.value))??null));default:throw Error(`Cannot convert to runtime value: ${e}`)}}var W=`
`,ji=`{%- `,Mi=` -%}`;function Ni(e){switch(e.operator.type){case`MultiplicativeBinaryOperator`:return 4;case`AdditiveBinaryOperator`:return 3;case`ComparisonBinaryOperator`:return 2;case`Identifier`:return e.operator.value===`and`?1:e.operator.value===`in`||e.operator.value===`not in`?2:0}return 0}function Pi(e,t=`	`){let n=typeof t==`number`?` `.repeat(t):t;return K(e.body,0,n).replace(/\n$/,``)}function G(...e){return ji+e.join(` `)+Mi}function K(e,t,n){return e.map(e=>Fi(e,t,n)).join(W)}function Fi(e,t,n){let r=n.repeat(t);switch(e.type){case`Program`:return K(e.body,t,n);case`If`:return Ii(e,t,n);case`For`:return Li(e,t,n);case`Set`:return Ri(e,t,n);case`Macro`:return zi(e,t,n);case`Break`:return r+G(`break`);case`Continue`:return r+G(`continue`);case`CallStatement`:return Bi(e,t,n);case`FilterStatement`:return Vi(e,t,n);case`Comment`:return r+`{# `+e.value+` #}`;default:return r+`{{- `+q(e)+` -}}`}}function Ii(e,t,n){let r=n.repeat(t),i=[],a=e;for(;a&&(i.push({test:a.test,body:a.body}),a.alternate.length===1&&a.alternate[0].type===`If`);)a=a.alternate[0];let o=r+G(`if`,q(i[0].test))+W+K(i[0].body,t+1,n);for(let e=1;e<i.length;++e)o+=W+r+G(`elif`,q(i[e].test))+W+K(i[e].body,t+1,n);return a&&a.alternate.length>0&&(o+=W+r+G(`else`)+W+K(a.alternate,t+1,n)),o+=W+r+G(`endif`),o}function Li(e,t,n){let r=n.repeat(t),i=``;if(e.iterable.type===`SelectExpression`){let t=e.iterable;i=`${q(t.lhs)} if ${q(t.test)}`}else i=q(e.iterable);let a=r+G(`for`,q(e.loopvar),`in`,i)+W+K(e.body,t+1,n);return e.defaultBlock.length>0&&(a+=W+r+G(`else`)+W+K(e.defaultBlock,t+1,n)),a+=W+r+G(`endfor`),a}function Ri(e,t,n){let r=n.repeat(t),i=q(e.assignee),a=e.value?q(e.value):``,o=r+G(`set`,`${i}${e.value?` = `+a:``}`);return e.body.length===0?o:o+W+K(e.body,t+1,n)+W+r+G(`endset`)}function zi(e,t,n){let r=n.repeat(t),i=e.args.map(q).join(`, `);return r+G(`macro`,`${e.name.value}(${i})`)+W+K(e.body,t+1,n)+W+r+G(`endmacro`)}function Bi(e,t,n){let r=n.repeat(t),i=e.callerArgs&&e.callerArgs.length>0?`(${e.callerArgs.map(q).join(`, `)})`:``,a=q(e.call),o=r+G(`call${i}`,a)+W;return o+=K(e.body,t+1,n)+W,o+=r+G(`endcall`),o}function Vi(e,t,n){let r=n.repeat(t),i=r+G(`filter`,e.filter.type===`Identifier`?e.filter.value:q(e.filter))+W;return i+=K(e.body,t+1,n)+W,i+=r+G(`endfilter`),i}function q(e,t=-1){switch(e.type){case`SpreadExpression`:return`*${q(e.argument)}`;case`Identifier`:return e.value;case`IntegerLiteral`:return`${e.value}`;case`FloatLiteral`:return`${e.value}`;case`StringLiteral`:return JSON.stringify(e.value);case`BinaryExpression`:{let n=e,r=Ni(n),i=q(n.left,r),a=q(n.right,r+1),o=`${i} ${n.operator.value} ${a}`;return r<t?`(${o})`:o}case`UnaryExpression`:{let t=e;return t.operator.value+(t.operator.value===`not`?` `:``)+q(t.argument,1/0)}case`CallExpression`:{let t=e,n=t.args.map(q).join(`, `);return`${q(t.callee)}(${n})`}case`MemberExpression`:{let t=e,n=q(t.object);[`Identifier`,`MemberExpression`,`CallExpression`,`StringLiteral`,`IntegerLiteral`,`FloatLiteral`,`ArrayLiteral`,`TupleLiteral`,`ObjectLiteral`].includes(t.object.type)||(n=`(${n})`);let r=q(t.property);return!t.computed&&t.property.type!==`Identifier`&&(r=`(${r})`),t.computed?`${n}[${r}]`:`${n}.${r}`}case`FilterExpression`:{let t=e,n=q(t.operand,1/0);return t.filter.type===`CallExpression`?`${n} | ${q(t.filter)}`:`${n} | ${t.filter.value}`}case`SelectExpression`:{let t=e;return`${q(t.lhs)} if ${q(t.test)}`}case`TestExpression`:{let t=e;return`${q(t.operand)} is${t.negate?` not`:``} ${t.test.value}`}case`ArrayLiteral`:case`TupleLiteral`:{let t=e.value.map(q),n=e.type===`ArrayLiteral`?`[]`:`()`;return`${n[0]}${t.join(`, `)}${n[1]}`}case`ObjectLiteral`:return`{${Array.from(e.value.entries()).map(([e,t])=>`${q(e)}: ${q(t)}`).join(`, `)}}`;case`SliceExpression`:{let t=e;return`${t.start?q(t.start):``}:${t.stop?q(t.stop):``}${t.step?`:${q(t.step)}`:``}`}case`KeywordArgumentExpression`:{let t=e;return`${t.key.value}=${q(t.value)}`}case`Ternary`:{let n=e,r=`${q(n.trueExpr)} if ${q(n.condition,0)} else ${q(n.falseExpr)}`;return t>-1?`(${r})`:r}default:throw Error(`Unknown expression type: ${e.type}`)}}var Hi=class{parsed;constructor(e){let t=Nr(e,{lstrip_blocks:!0,trim_blocks:!0});this.parsed=li(t)}render(e){let t=new U;if(Ei(t),e)for(let[n,r]of Object.entries(e))t.set(n,r);return new ki(t).run(this.parsed).value}format(e){return Pi(this.parsed,e?.indent||`	`)}},Ui={"adapter-transformers":[`question-answering`,`text-classification`,`token-classification`],allennlp:[`question-answering`],asteroid:[`audio-to-audio`],bertopic:[`text-classification`],diffusers:[`image-to-image`,`text-to-image`],doctr:[`object-detection`],espnet:[`text-to-speech`,`automatic-speech-recognition`],fairseq:[`text-to-speech`,`audio-to-audio`],fastai:[`image-classification`],fasttext:[`feature-extraction`,`text-classification`],flair:[`token-classification`],k2:[`automatic-speech-recognition`],keras:[`image-classification`],nemo:[`automatic-speech-recognition`],open_clip:[`zero-shot-classification`,`zero-shot-image-classification`],paddlenlp:[`fill-mask`,`summarization`,`zero-shot-classification`],peft:[`text-generation`],"pyannote-audio":[`automatic-speech-recognition`],"sentence-transformers":[`feature-extraction`,`sentence-similarity`],setfit:[`text-classification`],sklearn:[`tabular-classification`,`tabular-regression`,`text-classification`],spacy:[`token-classification`,`text-classification`,`sentence-similarity`],"span-marker":[`token-classification`],speechbrain:[`audio-classification`,`audio-to-audio`,`automatic-speech-recognition`,`text-to-speech`],stanza:[`token-classification`],timm:[`image-classification`,`image-feature-extraction`],transformers:`audio-classification.automatic-speech-recognition.depth-estimation.document-question-answering.feature-extraction.fill-mask.image-classification.image-feature-extraction.image-segmentation.image-to-image.image-to-text.image-text-to-text.mask-generation.object-detection.question-answering.summarization.table-question-answering.text-classification.text-generation.text-to-audio.text-to-speech.token-classification.translation.video-classification.visual-question-answering.zero-shot-classification.zero-shot-image-classification.zero-shot-object-detection`.split(`.`),mindspore:[`image-classification`]},Wi=[`image-to-text`,`summarization`,`translation`];new Map([[`text-classification`,[`پروژه به موقع تحویل شد و همه چیز خوب بود.`,`سیب‌زمینی بی‌کیفیت بود.`,`قیمت و کیفیت عالی`,`خوب نبود اصلا`]],[`token-classification`,[`این سریال به صورت رسمی در تاریخ دهم می ۲۰۱۱ توسط شبکه فاکس برای پخش رزرو شد.`,`دفتر مرکزی شرکت پارس‌مینو در شهر اراک در استان مرکزی قرار دارد.`,`وی در سال ۲۰۱۳ درگذشت و مسئول خاکسپاری و اقوامش برای او مراسم یادبود گرفتند.`]],[`question-answering`,[{text:`من کجا زندگی میکنم؟`,context:`نام من پژمان است و در گرگان زندگی میکنم.`},{text:`نامم چیست و کجا زندگی می‌کنم؟`,context:`اسمم سارا است و در آفریقای جنوبی زندگی میکنم.`},{text:`نام من چیست؟`,context:`من مریم هستم و در تبریز زندگی می‌کنم.`},{text:`بیشترین مساحت جنگل آمازون در کدام کشور است؟`,context:[`آمازون نام بزرگ‌ترین جنگل بارانی جهان است که در شمال آمریکای جنوبی قرار گرفته و بیشتر آن در خاک برزیل و پرو`,`جای دارد. بیش از نیمی از همه جنگل‌های بارانی باقی‌مانده در جهان در آمازون قرار دارد.`,`مساحت جنگل‌های آمازون ۵٫۵ میلیون کیلومتر مربع است که بین ۹ کشور تقسیم شده‌است.`].join(`
`)}]],[`translation`,[`بیشتر مساحت جنگل‌های آمازون در حوضه آبریز رود آمازون و ۱۱۰۰ شاخه آن واقع شده‌است.`,`مردمان نَبَطی از هزاره‌های یکم و دوم پیش از میلاد در این منطقه زندگی می‌کردند.`]],[`summarization`,[[`شاهنامه اثر حکیم ابوالقاسم فردوسی توسی، حماسه‌ای منظوم، بر حسب دست نوشته‌های `,`موجود دربرگیرنده نزدیک به ۵۰٬۰۰۰ بیت تا نزدیک به ۶۱٬۰۰۰ بیت و یکی از `,`بزرگ‌ترین و برجسته‌ترین سروده‌های حماسی جهان است که سرایش آن دست‌آوردِ `,`دست‌کم سی سال کارِ پیوستهٔ این سخن‌سرای نامدار ایرانی است. موضوع این شاهکار ادبی،`,` افسانه‌ها و تاریخ ایران از آغاز تا حملهٔ عرب‌ها به ایران در سدهٔ هفتم میلادی است`,`  (شاهنامه از سه بخش اسطوره، پهلوانی و تاریخی تشکیل شده‌است) که در چهار`,`   دودمان پادشاهیِ پیشدادیان، کیانیان، اشکانیان و ساسانیان گنجانده می‌شود.`,`    شاهنامه بر وزن «فَعولُن فعولن فعولن فَعَلْ»، در بحرِ مُتَقارِبِ مثمَّنِ محذوف نگاشته شده‌است.`,`هنگامی که زبان دانش و ادبیات در ایران زبان عربی بود، فردوسی، با سرودن شاهنامه`,` با ویژگی‌های هدف‌مندی که داشت، زبان پارسی را زنده و پایدار کرد. یکی از `,` بن‌مایه‌های مهمی که فردوسی برای سرودن شاهنامه از آن استفاده کرد،`,`  شاهنامهٔ ابومنصوری بود. شاهنامه نفوذ بسیاری در جهت‌گیری `,`  فرهنگ فارسی و نیز بازتاب‌های شکوه‌مندی در ادبیات جهان داشته‌است و شاعران `,`  بزرگی مانند گوته و ویکتور هوگو از آن به نیکی یاد کرده‌اند.`].join(`
`)]],[`text-generation`,[`اسم من نازنین است و من`,`روزی روزگاری`]],[`fill-mask`,[`زندگی یک سوال است و این که چگونه <mask> کنیم پاسخ این سوال!`,`زندگی از مرگ پرسید: چرا همه من را <mask> دارند اما از تو متنفرند؟`]]]);var Gi={"text-classification":{name:`Text Classification`,subtasks:[{type:`acceptability-classification`,name:`Acceptability Classification`},{type:`entity-linking-classification`,name:`Entity Linking Classification`},{type:`fact-checking`,name:`Fact Checking`},{type:`intent-classification`,name:`Intent Classification`},{type:`language-identification`,name:`Language Identification`},{type:`multi-class-classification`,name:`Multi Class Classification`},{type:`multi-label-classification`,name:`Multi Label Classification`},{type:`multi-input-text-classification`,name:`Multi-input Text Classification`},{type:`natural-language-inference`,name:`Natural Language Inference`},{type:`semantic-similarity-classification`,name:`Semantic Similarity Classification`},{type:`sentiment-classification`,name:`Sentiment Classification`},{type:`topic-classification`,name:`Topic Classification`},{type:`semantic-similarity-scoring`,name:`Semantic Similarity Scoring`},{type:`sentiment-scoring`,name:`Sentiment Scoring`},{type:`sentiment-analysis`,name:`Sentiment Analysis`},{type:`hate-speech-detection`,name:`Hate Speech Detection`},{type:`text-scoring`,name:`Text Scoring`}],modality:`nlp`},"token-classification":{name:`Token Classification`,subtasks:[{type:`named-entity-recognition`,name:`Named Entity Recognition`},{type:`part-of-speech`,name:`Part of Speech`},{type:`parsing`,name:`Parsing`},{type:`lemmatization`,name:`Lemmatization`},{type:`word-sense-disambiguation`,name:`Word Sense Disambiguation`},{type:`coreference-resolution`,name:`Coreference-resolution`}],modality:`nlp`},"table-question-answering":{name:`Table Question Answering`,modality:`nlp`},"question-answering":{name:`Question Answering`,subtasks:[{type:`extractive-qa`,name:`Extractive QA`},{type:`open-domain-qa`,name:`Open Domain QA`},{type:`closed-domain-qa`,name:`Closed Domain QA`}],modality:`nlp`},"zero-shot-classification":{name:`Zero-Shot Classification`,modality:`nlp`},translation:{name:`Translation`,modality:`nlp`},summarization:{name:`Summarization`,subtasks:[{type:`news-articles-summarization`,name:`News Articles Summarization`},{type:`news-articles-headline-generation`,name:`News Articles Headline Generation`}],modality:`nlp`},"feature-extraction":{name:`Feature Extraction`,modality:`nlp`},"text-generation":{name:`Text Generation`,subtasks:[{type:`dialogue-modeling`,name:`Dialogue Modeling`},{type:`dialogue-generation`,name:`Dialogue Generation`},{type:`conversational`,name:`Conversational`},{type:`language-modeling`,name:`Language Modeling`},{type:`text-simplification`,name:`Text simplification`},{type:`explanation-generation`,name:`Explanation Generation`},{type:`abstractive-qa`,name:`Abstractive QA`},{type:`open-domain-abstractive-qa`,name:`Open Domain Abstractive QA`},{type:`closed-domain-qa`,name:`Closed Domain QA`},{type:`open-book-qa`,name:`Open Book QA`},{type:`closed-book-qa`,name:`Closed Book QA`},{type:`text2text-generation`,name:`Text2Text Generation`}],modality:`nlp`},"fill-mask":{name:`Fill-Mask`,subtasks:[{type:`slot-filling`,name:`Slot Filling`},{type:`masked-language-modeling`,name:`Masked Language Modeling`}],modality:`nlp`},"sentence-similarity":{name:`Sentence Similarity`,modality:`nlp`},"text-to-speech":{name:`Text-to-Speech`,modality:`audio`},"text-to-audio":{name:`Text-to-Audio`,modality:`audio`},"automatic-speech-recognition":{name:`Automatic Speech Recognition`,modality:`audio`},"audio-to-audio":{name:`Audio-to-Audio`,modality:`audio`},"audio-classification":{name:`Audio Classification`,subtasks:[{type:`keyword-spotting`,name:`Keyword Spotting`},{type:`speaker-identification`,name:`Speaker Identification`},{type:`audio-intent-classification`,name:`Audio Intent Classification`},{type:`audio-emotion-recognition`,name:`Audio Emotion Recognition`},{type:`audio-language-identification`,name:`Audio Language Identification`}],modality:`audio`},"audio-text-to-text":{name:`Audio-Text-to-Text`,modality:`multimodal`,hideInDatasets:!0},"voice-activity-detection":{name:`Voice Activity Detection`,modality:`audio`},"depth-estimation":{name:`Depth Estimation`,modality:`cv`},"image-classification":{name:`Image Classification`,subtasks:[{type:`multi-label-image-classification`,name:`Multi Label Image Classification`},{type:`multi-class-image-classification`,name:`Multi Class Image Classification`}],modality:`cv`},"object-detection":{name:`Object Detection`,subtasks:[{type:`face-detection`,name:`Face Detection`},{type:`vehicle-detection`,name:`Vehicle Detection`}],modality:`cv`},"image-segmentation":{name:`Image Segmentation`,subtasks:[{type:`instance-segmentation`,name:`Instance Segmentation`},{type:`semantic-segmentation`,name:`Semantic Segmentation`},{type:`panoptic-segmentation`,name:`Panoptic Segmentation`}],modality:`cv`},"text-to-image":{name:`Text-to-Image`,modality:`cv`},"image-to-text":{name:`Image-to-Text`,subtasks:[{type:`image-captioning`,name:`Image Captioning`}],modality:`cv`},"image-to-image":{name:`Image-to-Image`,subtasks:[{type:`image-inpainting`,name:`Image Inpainting`},{type:`image-colorization`,name:`Image Colorization`},{type:`super-resolution`,name:`Super Resolution`}],modality:`cv`},"image-to-video":{name:`Image-to-Video`,modality:`cv`},"unconditional-image-generation":{name:`Unconditional Image Generation`,modality:`cv`},"video-classification":{name:`Video Classification`,modality:`cv`},"reinforcement-learning":{name:`Reinforcement Learning`,modality:`rl`},robotics:{name:`Robotics`,modality:`rl`,subtasks:[{type:`grasping`,name:`Grasping`},{type:`task-planning`,name:`Task Planning`}]},"tabular-classification":{name:`Tabular Classification`,modality:`tabular`,subtasks:[{type:`tabular-multi-class-classification`,name:`Tabular Multi Class Classification`},{type:`tabular-multi-label-classification`,name:`Tabular Multi Label Classification`}]},"tabular-regression":{name:`Tabular Regression`,modality:`tabular`,subtasks:[{type:`tabular-single-column-regression`,name:`Tabular Single Column Regression`}]},"tabular-to-text":{name:`Tabular to Text`,modality:`tabular`,subtasks:[{type:`rdf-to-text`,name:`RDF to text`}],hideInModels:!0},"table-to-text":{name:`Table to Text`,modality:`nlp`,hideInModels:!0},"multiple-choice":{name:`Multiple Choice`,subtasks:[{type:`multiple-choice-qa`,name:`Multiple Choice QA`},{type:`multiple-choice-coreference-resolution`,name:`Multiple Choice Coreference Resolution`}],modality:`nlp`,hideInModels:!0},"text-ranking":{name:`Text Ranking`,modality:`nlp`},"text-retrieval":{name:`Text Retrieval`,subtasks:[{type:`document-retrieval`,name:`Document Retrieval`},{type:`utterance-retrieval`,name:`Utterance Retrieval`},{type:`entity-linking-retrieval`,name:`Entity Linking Retrieval`},{type:`fact-checking-retrieval`,name:`Fact Checking Retrieval`}],modality:`nlp`,hideInModels:!0},"time-series-forecasting":{name:`Time Series Forecasting`,modality:`tabular`,subtasks:[{type:`univariate-time-series-forecasting`,name:`Univariate Time Series Forecasting`},{type:`multivariate-time-series-forecasting`,name:`Multivariate Time Series Forecasting`}]},"text-to-video":{name:`Text-to-Video`,modality:`cv`},"image-text-to-text":{name:`Image-Text-to-Text`,modality:`multimodal`},"image-text-to-image":{name:`Image-Text-to-Image`,modality:`multimodal`},"image-text-to-video":{name:`Image-Text-to-Video`,modality:`multimodal`},"visual-question-answering":{name:`Visual Question Answering`,subtasks:[{type:`visual-question-answering`,name:`Visual Question Answering`}],modality:`multimodal`},"document-question-answering":{name:`Document Question Answering`,subtasks:[{type:`document-question-answering`,name:`Document Question Answering`}],modality:`multimodal`,hideInDatasets:!0},"zero-shot-image-classification":{name:`Zero-Shot Image Classification`,modality:`cv`},"graph-ml":{name:`Graph Machine Learning`,modality:`other`},"mask-generation":{name:`Mask Generation`,modality:`cv`},"zero-shot-object-detection":{name:`Zero-Shot Object Detection`,modality:`cv`},"text-to-3d":{name:`Text-to-3D`,modality:`cv`},"image-to-3d":{name:`Image-to-3D`,modality:`cv`},"image-feature-extraction":{name:`Image Feature Extraction`,modality:`cv`},"video-text-to-text":{name:`Video-Text-to-Text`,modality:`multimodal`,hideInDatasets:!1},"keypoint-detection":{name:`Keypoint Detection`,subtasks:[{type:`pose-estimation`,name:`Pose Estimation`}],modality:`cv`,hideInDatasets:!0},"visual-document-retrieval":{name:`Visual Document Retrieval`,modality:`multimodal`},"any-to-any":{name:`Any-to-Any`,modality:`multimodal`},"video-to-video":{name:`Video-to-Video`,modality:`cv`,hideInDatasets:!0},other:{name:`Other`,modality:`other`,hideInModels:!0,hideInDatasets:!0}},Ki=Object.keys(Gi);Object.values(Gi).flatMap(e=>`subtasks`in e?e.subtasks:[]).map(e=>e.type),new Set(Ki);var qi={datasets:[{description:`A dataset with multiple modality input and output pairs.`,id:`PKU-Alignment/align-anything`}],demo:{inputs:[{filename:`any-to-any-input.jpg`,type:`img`},{label:`Text Prompt`,content:`What is the significance of this place?`,type:`text`}],outputs:[{label:`Generated Text`,content:`The place in the picture is Osaka Castle, located in Osaka, Japan. Osaka Castle is a historic castle that was originally built in the 16th century by Toyotomi Hideyoshi, a powerful warlord of the time. It is one of the most famous landmarks in Osaka and is known for its distinctive white walls and black roof tiles. The castle has been rebuilt several times over the centuries and is now a popular tourist attraction, offering visitors a glimpse into Japan's rich history and culture.`,type:`text`},{filename:`any-to-any-output.wav`,type:`audio`}]},metrics:[],models:[{description:`Strong model that can take in video, audio, image, text and output text and natural speech.`,id:`Qwen/Qwen2.5-Omni-7B`},{description:`Robust model that can take in image and text and generate image and text.`,id:`OmniGen2/OmniGen2`},{description:`Any-to-any model with speech, video, audio, image and text understanding capabilities.`,id:`openbmb/MiniCPM-o-2_6`},{description:`A model that can understand image and text and generate image and text.`,id:`ByteDance-Seed/BAGEL-7B-MoT`}],spaces:[{description:`An application to chat with an any-to-any (image & text) model.`,id:`OmniGen2/OmniGen2`}],summary:`Any-to-any models can understand two or more modalities and output two or more modalities.`,widgetModels:[],youtubeId:``},Ji={datasets:[{description:`A benchmark of 10 different audio tasks.`,id:`s3prl/superb`},{description:`A dataset of YouTube clips and their sound categories.`,id:`agkphysics/AudioSet`}],demo:{inputs:[{filename:`audio.wav`,type:`audio`}],outputs:[{data:[{label:`Up`,score:.2},{label:`Down`,score:.8}],type:`chart`}]},metrics:[{description:``,id:`accuracy`},{description:``,id:`recall`},{description:``,id:`precision`},{description:``,id:`f1`}],models:[{description:`An easy-to-use model for command recognition.`,id:`speechbrain/google_speech_command_xvector`},{description:`An emotion recognition model.`,id:`ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition`},{description:`A language identification model.`,id:`facebook/mms-lid-126`}],spaces:[{description:`An application that can classify music into different genre.`,id:`kurianbenoy/audioclassification`}],summary:`Audio classification is the task of assigning a label or class to a given audio. It can be used for recognizing which command a user is giving or the emotion of a statement, as well as identifying a speaker.`,widgetModels:[`MIT/ast-finetuned-audioset-10-10-0.4593`],youtubeId:`KWwzcmG98Ds`},Yi={datasets:[{description:`A dataset containing audio conversations with question–answer pairs.`,id:`nvidia/AF-Think`},{description:`A more advanced and comprehensive dataset that contains characteristics of the audio as well`,id:`tsinghua-ee/QualiSpeech`}],demo:{inputs:[{filename:`audio.wav`,type:`audio`},{label:`Text Prompt`,content:`What is the gender of the speaker?`,type:`text`}],outputs:[{label:`Generated Text`,content:`The gender of the speaker is female.`,type:`text`}]},metrics:[],models:[{description:`A lightweight model that has capabilities of taking both audio and text as inputs and generating responses.`,id:`fixie-ai/ultravox-v0_5-llama-3_2-1b`},{description:`A multimodal model that supports voice chat and audio analysis.`,id:`Qwen/Qwen2-Audio-7B-Instruct`},{description:`A model for audio understanding, speech translation, and transcription.`,id:`mistralai/Voxtral-Small-24B-2507`},{description:`A new model capable of audio question answering and reasoning.`,id:`nvidia/audio-flamingo-3`}],spaces:[{description:`A space that takes input as both audio and text and generates answers.`,id:`iamomtiwari/ATTT`},{description:`A web application that demonstrates chatting with the Qwen2Audio Model.`,id:`freddyaboulton/talk-to-qwen-webrtc`}],summary:`Audio-text-to-text models take both an audio clip and a text prompt as input, and generate natural language text as output. These models can answer questions about spoken content, summarize meetings, analyze music, or interpret speech beyond simple transcription. They are useful for applications that combine speech understanding with reasoning or conversation.`,widgetModels:[],youtubeId:``},Xi={datasets:[{description:`512-element X-vector embeddings of speakers from CMU ARCTIC dataset.`,id:`Matthijs/cmu-arctic-xvectors`}],demo:{inputs:[{filename:`input.wav`,type:`audio`}],outputs:[{filename:`label-0.wav`,type:`audio`},{filename:`label-1.wav`,type:`audio`}]},metrics:[{description:`The Signal-to-Noise ratio is the relationship between the target signal level and the background noise level. It is calculated as the logarithm of the target signal divided by the background noise, in decibels.`,id:`snri`},{description:`The Signal-to-Distortion ratio is the relationship between the target signal and the sum of noise, interference, and artifact errors`,id:`sdri`}],models:[{description:`A speech enhancement model.`,id:`ResembleAI/resemble-enhance`},{description:`A model that can change the voice in a speech recording.`,id:`microsoft/speecht5_vc`}],spaces:[{description:`An application for speech separation.`,id:`younver/speechbrain-speech-separation`},{description:`An application for audio style transfer.`,id:`nakas/audio-diffusion_style_transfer`}],summary:`Audio-to-Audio is a family of tasks in which the input is an audio and the output is one or multiple generated audios. Some example tasks are speech enhancement and source separation.`,widgetModels:[`speechbrain/sepformer-wham`],youtubeId:`iohj7nCCYoM`},Zi={datasets:[{description:`31,175 hours of multilingual audio-text dataset in 108 languages.`,id:`mozilla-foundation/common_voice_17_0`},{description:`Multilingual and diverse audio dataset with 101k hours of audio.`,id:`amphion/Emilia-Dataset`},{description:`A dataset with 44.6k hours of English speaker data and 6k hours of other language speakers.`,id:`parler-tts/mls_eng`},{description:`A multilingual audio dataset with 370K hours of audio.`,id:`espnet/yodas`}],demo:{inputs:[{filename:`input.flac`,type:`audio`}],outputs:[{label:`Transcript`,content:`Going along slushy country roads and speaking to damp audiences in...`,type:`text`}]},metrics:[{description:``,id:`wer`},{description:``,id:`cer`}],models:[{description:`A powerful ASR model by OpenAI.`,id:`openai/whisper-large-v3`},{description:`A good generic speech model by MetaAI for fine-tuning.`,id:`facebook/w2v-bert-2.0`},{description:`An end-to-end model that performs ASR and Speech Translation by MetaAI.`,id:`facebook/seamless-m4t-v2-large`},{description:`A powerful multilingual ASR and Speech Translation model by Nvidia.`,id:`nvidia/canary-1b`},{description:`Powerful speaker diarization model.`,id:`pyannote/speaker-diarization-3.1`}],spaces:[{description:`A powerful general-purpose speech recognition application.`,id:`hf-audio/whisper-large-v3`},{description:`Latest ASR model from Useful Sensors.`,id:`mrfakename/Moonshinex`},{description:`A high quality speech and text translation model by Meta.`,id:`facebook/seamless_m4t`},{description:`A powerful multilingual ASR and Speech Translation model by Nvidia`,id:`nvidia/canary-1b`}],summary:`Automatic Speech Recognition (ASR), also known as Speech to Text (STT), is the task of transcribing a given audio to text. It has many applications, such as voice user interfaces.`,widgetModels:[`openai/whisper-large-v3`],youtubeId:`TksaY_FDgnk`},Qi={datasets:[{description:`Largest document understanding dataset.`,id:`HuggingFaceM4/Docmatix`},{description:`Dataset from the 2020 DocVQA challenge. The documents are taken from the UCSF Industry Documents Library.`,id:`eliolio/docvqa`}],demo:{inputs:[{label:`Question`,content:`What is the idea behind the consumer relations efficiency team?`,type:`text`},{filename:`document-question-answering-input.png`,type:`img`}],outputs:[{label:`Answer`,content:`Balance cost efficiency with quality customer service`,type:`text`}]},metrics:[{description:`The evaluation metric for the DocVQA challenge is the Average Normalized Levenshtein Similarity (ANLS). This metric is flexible to character regognition errors and compares the predicted answer with the ground truth answer.`,id:`anls`},{description:`Exact Match is a metric based on the strict character match of the predicted answer and the right answer. For answers predicted correctly, the Exact Match will be 1. Even if only one character is different, Exact Match will be 0`,id:`exact-match`}],models:[{description:`A robust document question answering model.`,id:`impira/layoutlm-document-qa`},{description:`A document question answering model specialized in invoices.`,id:`impira/layoutlm-invoices`},{description:`A special model for OCR-free document question answering.`,id:`microsoft/udop-large`},{description:`A powerful model for document question answering.`,id:`google/pix2struct-docvqa-large`}],spaces:[{description:`A robust document question answering application.`,id:`impira/docquery`},{description:`An application that can answer questions from invoices.`,id:`impira/invoices`},{description:`An application to compare different document question answering models.`,id:`merve/compare_docvqa_models`}],summary:`Document Question Answering (also known as Document Visual Question Answering) is the task of answering questions on document images. Document question answering models take a (document, question) pair as input and return an answer in natural language. Models usually rely on multi-modal features, combining text, position of words (bounding-boxes) and image.`,widgetModels:[`impira/layoutlm-invoices`],youtubeId:``},$i={datasets:[{description:"Wikipedia dataset containing cleaned articles of all languages. Can be used to train `feature-extraction` models.",id:`wikipedia`}],demo:{inputs:[{label:`Input`,content:`India, officially the Republic of India, is a country in South Asia.`,type:`text`}],outputs:[{table:[[`Dimension 1`,`Dimension 2`,`Dimension 3`],[`2.583383083343506`,`2.757075071334839`,`0.9023529887199402`],[`8.29393482208252`,`1.1071064472198486`,`2.03399395942688`],[`-0.7754912972450256`,`-1.647324562072754`,`-0.6113331913948059`],[`0.07087723910808563`,`1.5942802429199219`,`1.4610432386398315`]],type:`tabular`}]},metrics:[],models:[{description:`A powerful feature extraction model for natural language processing tasks.`,id:`thenlper/gte-large`},{description:`A strong feature extraction model for retrieval.`,id:`Alibaba-NLP/gte-Qwen1.5-7B-instruct`}],spaces:[{description:`A leaderboard to rank text feature extraction models based on a benchmark.`,id:`mteb/leaderboard`},{description:`A leaderboard to rank best feature extraction models based on human feedback.`,id:`mteb/arena`}],summary:`Feature extraction is the task of extracting features learnt in a model.`,widgetModels:[`facebook/bart-base`]},ea={datasets:[{description:`A common dataset that is used to train models for many languages.`,id:`wikipedia`},{description:`A large English dataset with text crawled from the web.`,id:`c4`}],demo:{inputs:[{label:`Input`,content:`The <mask> barked at me`,type:`text`}],outputs:[{type:`chart`,data:[{label:`wolf`,score:.487},{label:`dog`,score:.061},{label:`cat`,score:.058},{label:`fox`,score:.047},{label:`squirrel`,score:.025}]}]},metrics:[{description:`Cross Entropy is a metric that calculates the difference between two probability distributions. Each probability distribution is the distribution of predicted words`,id:`cross_entropy`},{description:`Perplexity is the exponential of the cross-entropy loss. It evaluates the probabilities assigned to the next word by the model. Lower perplexity indicates better performance`,id:`perplexity`}],models:[{description:`State-of-the-art masked language model.`,id:`answerdotai/ModernBERT-large`},{description:`A multilingual model trained on 100 languages.`,id:`FacebookAI/xlm-roberta-base`}],spaces:[],summary:`Masked language modeling is the task of masking some of the words in a sentence and predicting which words should replace those masks. These models are useful when we want to get a statistical understanding of the language in which the model is trained in.`,widgetModels:[`distilroberta-base`],youtubeId:`mqElG5QJWUg`},ta={datasets:[{description:`Benchmark dataset used for image classification with images that belong to 100 classes.`,id:`cifar100`},{description:`Dataset consisting of images of garments.`,id:`fashion_mnist`}],demo:{inputs:[{filename:`image-classification-input.jpeg`,type:`img`}],outputs:[{type:`chart`,data:[{label:`Egyptian cat`,score:.514},{label:`Tabby cat`,score:.193},{label:`Tiger cat`,score:.068}]}]},metrics:[{description:``,id:`accuracy`},{description:``,id:`recall`},{description:``,id:`precision`},{description:``,id:`f1`}],models:[{description:`A strong image classification model.`,id:`google/vit-base-patch16-224`},{description:`A robust image classification model.`,id:`facebook/deit-base-distilled-patch16-224`},{description:`A strong image classification model.`,id:`facebook/convnext-large-224`}],spaces:[{description:`A leaderboard to evaluate different image classification models.`,id:`timm/leaderboard`}],summary:`Image classification is the task of assigning a label or class to an entire image. Images are expected to have only one class for each image. Image classification models take an image as input and return a prediction about which class the image belongs to.`,widgetModels:[`google/vit-base-patch16-224`],youtubeId:`tjAIM7BOYhw`},na={datasets:[{description:`ImageNet-1K is a image classification dataset in which images are used to train image-feature-extraction models.`,id:`imagenet-1k`}],demo:{inputs:[{filename:`mask-generation-input.png`,type:`img`}],outputs:[{table:[[`Dimension 1`,`Dimension 2`,`Dimension 3`],[`0.21236686408519745`,`1.0919708013534546`,`0.8512550592422485`],[`0.809657871723175`,`-0.18544459342956543`,`-0.7851548194885254`],[`1.3103108406066895`,`-0.2479034662246704`,`-0.9107287526130676`],[`1.8536205291748047`,`-0.36419737339019775`,`0.09717650711536407`]],type:`tabular`}]},metrics:[],models:[{description:`A powerful image feature extraction model.`,id:`timm/vit_large_patch14_dinov2.lvd142m`},{description:`A strong image feature extraction model.`,id:`nvidia/MambaVision-T-1K`},{description:`A robust image feature extraction model.`,id:`facebook/dino-vitb16`},{description:`Cutting-edge image feature extraction model.`,id:`apple/aimv2-large-patch14-336-distilled`},{description:`Strong image feature extraction model that can be used on images and documents.`,id:`OpenGVLab/InternViT-6B-448px-V1-2`}],spaces:[{description:`A leaderboard to evaluate different image-feature-extraction models on classification performances`,id:`timm/leaderboard`}],summary:`Image feature extraction is the task of extracting features learnt in a computer vision model.`,widgetModels:[]},ra={datasets:[{description:`Synthetic dataset, for image relighting`,id:`VIDIT`},{description:`Multiple images of celebrities, used for facial expression translation`,id:`huggan/CelebA-faces`},{description:`12M image-caption pairs.`,id:`Spawning/PD12M`}],demo:{inputs:[{filename:`image-to-image-input.jpeg`,type:`img`}],outputs:[{filename:`image-to-image-output.png`,type:`img`}]},isPlaceholder:!1,metrics:[{description:`Peak Signal to Noise Ratio (PSNR) is an approximation of the human perception, considering the ratio of the absolute intensity with respect to the variations. Measured in dB, a high value indicates a high fidelity.`,id:`PSNR`},{description:`Structural Similarity Index (SSIM) is a perceptual metric which compares the luminance, contrast and structure of two images. The values of SSIM range between -1 and 1, and higher values indicate closer resemblance to the original image.`,id:`SSIM`},{description:`Inception Score (IS) is an analysis of the labels predicted by an image classification model when presented with a sample of the generated images.`,id:`IS`}],models:[{description:`An image-to-image model to improve image resolution.`,id:`fal/AuraSR-v2`},{description:`Powerful image editing model.`,id:`black-forest-labs/FLUX.1-Kontext-dev`},{description:`Virtual try-on model.`,id:`yisol/IDM-VTON`},{description:`Image re-lighting model.`,id:`kontext-community/relighting-kontext-dev-lora-v3`},{description:`Strong model for inpainting and outpainting.`,id:`black-forest-labs/FLUX.1-Fill-dev`},{description:`Strong model for image editing using depth maps.`,id:`black-forest-labs/FLUX.1-Depth-dev-lora`}],spaces:[{description:`Image editing application.`,id:`black-forest-labs/FLUX.1-Kontext-Dev`},{description:`Image relighting application.`,id:`lllyasviel/iclight-v2-vary`},{description:`An application for image upscaling.`,id:`jasperai/Flux.1-dev-Controlnet-Upscaler`}],summary:`Image-to-image is the task of transforming an input image through a variety of possible manipulations and enhancements, such as super-resolution, image inpainting, colorization, and more.`,widgetModels:[`Qwen/Qwen-Image`],youtubeId:``},ia={datasets:[{description:`Dataset from 12M image-text of Reddit`,id:`red_caps`},{description:`Dataset from 3.3M images of Google`,id:`datasets/conceptual_captions`}],demo:{inputs:[{filename:`savanna.jpg`,type:`img`}],outputs:[{label:`Detailed description`,content:`a herd of giraffes and zebras grazing in a field`,type:`text`}]},metrics:[],models:[{description:`Strong OCR model.`,id:`allenai/olmOCR-7B-0725`},{description:`Powerful image captioning model.`,id:`fancyfeast/llama-joycaption-beta-one-hf-llava`}],spaces:[{description:`SVG generator app from images.`,id:`multimodalart/OmniSVG-3B`},{description:`An application that converts documents to markdown.`,id:`numind/NuMarkdown-8B-Thinking`},{description:`An application that can caption images.`,id:`fancyfeast/joy-caption-beta-one`}],summary:`Image to text models output a text from a given image. Image captioning or optical character recognition can be considered as the most common applications of image to text.`,widgetModels:[`Salesforce/blip-image-captioning-large`],youtubeId:``},aa={datasets:[{description:`Instructions composed of image and text.`,id:`liuhaotian/LLaVA-Instruct-150K`},{description:`Collection of image-text pairs on scientific topics.`,id:`DAMO-NLP-SG/multimodal_textbook`},{description:`A collection of datasets made for model fine-tuning.`,id:`HuggingFaceM4/the_cauldron`},{description:`Screenshots of websites with their HTML/CSS codes.`,id:`HuggingFaceM4/WebSight`}],demo:{inputs:[{filename:`image-text-to-text-input.png`,type:`img`},{label:`Text Prompt`,content:`Describe the position of the bee in detail.`,type:`text`}],outputs:[{label:`Answer`,content:`The bee is sitting on a pink flower, surrounded by other flowers. The bee is positioned in the center of the flower, with its head and front legs sticking out.`,type:`text`}]},metrics:[],models:[{description:`Small and efficient yet powerful vision language model.`,id:`HuggingFaceTB/SmolVLM-Instruct`},{description:`Cutting-edge reasoning vision language model.`,id:`zai-org/GLM-4.5V`},{description:`Cutting-edge small vision language model to convert documents to text.`,id:`rednote-hilab/dots.ocr`},{description:`Small yet powerful model.`,id:`Qwen/Qwen2.5-VL-3B-Instruct`},{description:`Image-text-to-text model with agentic capabilities.`,id:`microsoft/Magma-8B`}],spaces:[{description:`Leaderboard to evaluate vision language models.`,id:`opencompass/open_vlm_leaderboard`},{description:`An application that compares object detection capabilities of different vision language models.`,id:`sergiopaniego/vlm_object_understanding`},{description:`An application to compare different OCR models.`,id:`prithivMLmods/Multimodal-OCR`}],summary:`Image-text-to-text models take in an image and text prompt and output text. These models are also called vision-language models, or VLMs. The difference from image-to-text models is that these models take an additional text input, not restricting the model to certain use cases like image captioning, and may also be trained to accept a conversation as input.`,widgetModels:[`zai-org/GLM-4.5V`],youtubeId:`IoGaGfU1CIg`},oa={datasets:[],demo:{inputs:[{filename:`image-text-to-image-input.jpeg`,type:`img`},{label:`Input`,content:`A city above clouds, pastel colors, Victorian style`,type:`text`}],outputs:[{filename:`image-text-to-image-output.png`,type:`img`}]},metrics:[{description:`The Fréchet Inception Distance (FID) calculates the distance between distributions between synthetic and real samples. A lower FID score indicates better similarity between the distributions of real and generated images.`,id:`FID`},{description:`CLIP Score measures the similarity between the generated image and the text prompt using CLIP embeddings. A higher score indicates better alignment with the text prompt.`,id:`CLIP`}],models:[{description:`A powerful model for image-text-to-image generation.`,id:`black-forest-labs/FLUX.2-dev`}],spaces:[{description:`An application for image-text-to-image generation.`,id:`black-forest-labs/FLUX.2-dev`}],summary:`Image-text-to-image models take an image and a text prompt as input and generate a new image based on the reference image and text instructions. These models are useful for image editing, style transfer, image variations, and guided image generation tasks.`,widgetModels:[`black-forest-labs/FLUX.2-dev`],youtubeId:void 0},sa={datasets:[],demo:{inputs:[{filename:`image-text-to-video-input.jpg`,type:`img`},{label:`Input`,content:`Darth Vader is surfing on the waves.`,type:`text`}],outputs:[{filename:`image-text-to-video-output.gif`,type:`img`}]},metrics:[{description:`Frechet Video Distance uses a model that captures coherence for changes in frames and the quality of each frame. A smaller score indicates better video generation.`,id:`fvd`},{description:`CLIPSIM measures similarity between video frames and text using an image-text similarity model. A higher score indicates better video generation.`,id:`clipsim`}],models:[{description:`A powerful model for image-text-to-video generation.`,id:`Lightricks/LTX-Video`}],spaces:[{description:`An application for image-text-to-video generation.`,id:`Lightricks/ltx-video-distilled`}],summary:`Image-text-to-video models take an reference image and a text instructions as and generate a video based on them. These models are useful for animating still images, creating dynamic content from static references, and generating videos with specific motion or transformation guidance.`,widgetModels:[`Lightricks/LTX-Video`],youtubeId:void 0},ca={datasets:[{description:`Scene segmentation dataset.`,id:`scene_parse_150`}],demo:{inputs:[{filename:`image-segmentation-input.jpeg`,type:`img`}],outputs:[{filename:`image-segmentation-output.png`,type:`img`}]},metrics:[{description:`Average Precision (AP) is the Area Under the PR Curve (AUC-PR). It is calculated for each semantic class separately`,id:`Average Precision`},{description:`Mean Average Precision (mAP) is the overall average of the AP values`,id:`Mean Average Precision`},{description:`Intersection over Union (IoU) is the overlap of segmentation masks. Mean IoU is the average of the IoU of all semantic classes`,id:`Mean Intersection over Union`},{description:`APα is the Average Precision at the IoU threshold of a α value, for example, AP50 and AP75`,id:`APα`}],models:[{description:`Solid panoptic segmentation model trained on COCO.`,id:`tue-mps/coco_panoptic_eomt_large_640`},{description:`Background removal model.`,id:`briaai/RMBG-1.4`},{description:`A multipurpose image segmentation model for high resolution images.`,id:`ZhengPeng7/BiRefNet`},{description:`Powerful human-centric image segmentation model.`,id:`facebook/sapiens-seg-1b`},{description:`Panoptic segmentation model trained on the COCO (common objects) dataset.`,id:`facebook/mask2former-swin-large-coco-panoptic`}],spaces:[{description:`A semantic segmentation application that can predict unseen instances out of the box.`,id:`facebook/ov-seg`},{description:`One of the strongest segmentation applications.`,id:`jbrinkma/segment-anything`},{description:`A human-centric segmentation model.`,id:`facebook/sapiens-pose`},{description:`An instance segmentation application to predict neuronal cell types from microscopy images.`,id:`rashmi/sartorius-cell-instance-segmentation`},{description:`An application that segments videos.`,id:`ArtGAN/Segment-Anything-Video`},{description:`An panoptic segmentation application built for outdoor environments.`,id:`segments/panoptic-segment-anything`}],summary:`Image Segmentation divides an image into segments where each pixel in the image is mapped to an object. This task has multiple variants such as instance segmentation, panoptic segmentation and semantic segmentation.`,widgetModels:[`nvidia/segformer-b0-finetuned-ade-512-512`],youtubeId:`dKE8SIt9C-w`},la={datasets:[{description:`A benchmark dataset for reference image controlled video generation.`,id:`ali-vilab/VACE-Benchmark`},{description:`A dataset of video generation style preferences.`,id:`Rapidata/sora-video-generation-style-likert-scoring`},{description:`A dataset with videos and captions throughout the videos.`,id:`BestWishYsh/ChronoMagic`}],demo:{inputs:[{filename:`image-to-video-input.jpg`,type:`img`},{label:`Optional Text Prompt`,content:`This penguin is dancing`,type:`text`}],outputs:[{filename:`image-to-video-output.gif`,type:`img`}]},metrics:[{description:`Fréchet Video Distance (FVD) measures the perceptual similarity between the distributions of generated videos and a set of real videos, assessing overall visual quality and temporal coherence of the video generated from an input image.`,id:`fvd`},{description:`CLIP Score measures the semantic similarity between a textual prompt (if provided alongside the input image) and the generated video frames. It evaluates how well the video's generated content and motion align with the textual description, conditioned on the initial image.`,id:`clip_score`},{description:`First Frame Fidelity, often measured using LPIPS (Learned Perceptual Image Patch Similarity), PSNR, or SSIM, quantifies how closely the first frame of the generated video matches the input conditioning image.`,id:`lpips`},{description:`Identity Preservation Score measures the consistency of identity (e.g., a person's face or a specific object's characteristics) between the input image and throughout the generated video frames, often calculated using features from specialized models like face recognition (e.g., ArcFace) or re-identification models.`,id:`identity_preservation`},{description:`Motion Score evaluates the quality, realism, and temporal consistency of motion in the video generated from a static image. This can be based on optical flow analysis (e.g., smoothness, magnitude), consistency of object trajectories, or specific motion plausibility assessments.`,id:`motion_score`}],models:[{description:`LTX-Video, a 13B parameter model for high quality video generation`,id:`Lightricks/LTX-Video-0.9.7-dev`},{description:`A 14B parameter model for reference image controlled video generation`,id:`Wan-AI/Wan2.1-VACE-14B`},{description:`An image-to-video generation model using FramePack F1 methodology with Hunyuan-DiT architecture`,id:`lllyasviel/FramePack_F1_I2V_HY_20250503`},{description:`A distilled version of the LTX-Video-0.9.7-dev model for faster inference`,id:`Lightricks/LTX-Video-0.9.7-distilled`},{description:`An image-to-video generation model by Skywork AI, 14B parameters, producing 720p videos.`,id:`Skywork/SkyReels-V2-I2V-14B-720P`},{description:`Image-to-video variant of Tencent's HunyuanVideo.`,id:`tencent/HunyuanVideo-I2V`},{description:`A 14B parameter model for 720p image-to-video generation by Wan-AI.`,id:`Wan-AI/Wan2.1-I2V-14B-720P`},{description:`A Diffusers version of the Wan2.1-I2V-14B-720P model for 720p image-to-video generation.`,id:`Wan-AI/Wan2.1-I2V-14B-720P-Diffusers`}],spaces:[{description:`An application to generate videos fast.`,id:`Lightricks/ltx-video-distilled`},{description:`Generate videos with the FramePack-F1`,id:`linoyts/FramePack-F1`},{description:`Generate videos with the FramePack`,id:`lisonallen/framepack-i2v`},{description:`Wan2.1 with CausVid LoRA`,id:`multimodalart/wan2-1-fast`},{description:`A demo for Stable Video Diffusion`,id:`multimodalart/stable-video-diffusion`}],summary:`Image-to-video models take a still image as input and generate a video. These models can be guided by text prompts to influence the content and style of the output video.`,widgetModels:[],youtubeId:void 0},ua={datasets:[{description:`Widely used benchmark dataset for multiple Vision tasks.`,id:`merve/coco2017`},{description:`Medical Imaging dataset of the Human Brain for segmentation and mask generating tasks`,id:`rocky93/BraTS_segmentation`}],demo:{inputs:[{filename:`mask-generation-input.png`,type:`img`}],outputs:[{filename:`mask-generation-output.png`,type:`img`}]},metrics:[{description:`IoU is used to measure the overlap between predicted mask and the ground truth mask.`,id:`Intersection over Union (IoU)`}],models:[{description:`Small yet powerful mask generation model.`,id:`Zigeng/SlimSAM-uniform-50`},{description:`Very strong mask generation model.`,id:`facebook/sam2-hiera-large`}],spaces:[{description:`An application that combines a mask generation model with a zero-shot object detection model for text-guided image segmentation.`,id:`merve/OWLSAM2`},{description:`An application that compares the performance of a large and a small mask generation model.`,id:`merve/slimsam`},{description:`An application based on an improved mask generation model.`,id:`SkalskiP/segment-anything-model-2`},{description:`An application to remove objects from videos using mask generation models.`,id:`SkalskiP/SAM_and_ProPainter`}],summary:`Mask generation is the task of generating masks that identify a specific object or region of interest in a given image. Masks are often used in segmentation tasks, where they provide a precise way to isolate the object of interest for further processing or analysis.`,widgetModels:[],youtubeId:``},da={datasets:[{description:`Widely used benchmark dataset for multiple vision tasks.`,id:`merve/coco2017`},{description:`Multi-task computer vision benchmark.`,id:`merve/pascal-voc`}],demo:{inputs:[{filename:`object-detection-input.jpg`,type:`img`}],outputs:[{filename:`object-detection-output.jpg`,type:`img`}]},metrics:[{description:`The Average Precision (AP) metric is the Area Under the PR Curve (AUC-PR). It is calculated for each class separately`,id:`Average Precision`},{description:`The Mean Average Precision (mAP) metric is the overall average of the AP values`,id:`Mean Average Precision`},{description:`The APα metric is the Average Precision at the IoU threshold of a α value, for example, AP50 and AP75`,id:`APα`}],models:[{description:`Solid object detection model pre-trained on the COCO 2017 dataset.`,id:`facebook/detr-resnet-50`},{description:`Accurate object detection model.`,id:`IDEA-Research/dab-detr-resnet-50`},{description:`Fast and accurate object detection model.`,id:`PekingU/rtdetr_v2_r50vd`},{description:`Object detection model for low-lying objects.`,id:`StephanST/WALDO30`}],spaces:[{description:`Real-time object detection demo.`,id:`Roboflow/RF-DETR`},{description:`An application that contains various object detection models to try from.`,id:`Gradio-Blocks/Object-Detection-With-DETR-and-YOLOS`},{description:`A cutting-edge object detection application.`,id:`sunsmarterjieleaf/yolov12`},{description:`An object tracking, segmentation and inpainting application.`,id:`VIPLab/Track-Anything`},{description:`Very fast object tracking application based on object detection.`,id:`merve/RT-DETR-tracking-coco`}],summary:`Object Detection models allow users to identify objects of certain defined classes. Object detection models receive an image as input and output the images with bounding boxes and labels on detected objects.`,widgetModels:[`facebook/detr-resnet-50`],youtubeId:`WdAeKSOpxhw`},fa={datasets:[{description:`NYU Depth V2 Dataset: Video dataset containing both RGB and depth sensor data.`,id:`sayakpaul/nyu_depth_v2`},{description:`Monocular depth estimation benchmark based without noise and errors.`,id:`depth-anything/DA-2K`}],demo:{inputs:[{filename:`depth-estimation-input.jpg`,type:`img`}],outputs:[{filename:`depth-estimation-output.png`,type:`img`}]},metrics:[],models:[{description:`Cutting-edge depth estimation model.`,id:`depth-anything/Depth-Anything-V2-Large`},{description:`A strong monocular depth estimation model.`,id:`jingheya/lotus-depth-g-v1-0`},{description:`A depth estimation model that predicts depth in videos.`,id:`tencent/DepthCrafter`},{description:`A robust depth estimation model.`,id:`apple/DepthPro-hf`}],spaces:[{description:`An application that predicts the depth of an image and then reconstruct the 3D model as voxels.`,id:`radames/dpt-depth-estimation-3d-voxels`},{description:`An application for bleeding-edge depth estimation.`,id:`akhaliq/depth-pro`},{description:`An application on cutting-edge depth estimation in videos.`,id:`tencent/DepthCrafter`},{description:`A human-centric depth estimation application.`,id:`facebook/sapiens-depth`}],summary:`Depth estimation is the task of predicting depth of the objects present in an image.`,widgetModels:[``],youtubeId:``},pa={datasets:[],demo:{inputs:[],outputs:[]},isPlaceholder:!0,metrics:[],models:[],spaces:[],summary:``,widgetModels:[],youtubeId:void 0,canonicalId:void 0},ma={datasets:[{description:`A curation of widely used datasets for Data Driven Deep Reinforcement Learning (D4RL)`,id:`edbeeching/decision_transformer_gym_replay`}],demo:{inputs:[{label:`State`,content:`Red traffic light, pedestrians are about to pass.`,type:`text`}],outputs:[{label:`Action`,content:`Stop the car.`,type:`text`},{label:`Next State`,content:`Yellow light, pedestrians have crossed.`,type:`text`}]},metrics:[{description:`Accumulated reward across all time steps discounted by a factor that ranges between 0 and 1 and determines how much the agent optimizes for future relative to immediate rewards. Measures how good is the policy ultimately found by a given algorithm considering uncertainty over the future.`,id:`Discounted Total Reward`},{description:`Average return obtained after running the policy for a certain number of evaluation episodes. As opposed to total reward, mean reward considers how much reward a given algorithm receives while learning.`,id:`Mean Reward`},{description:`Measures how good a given algorithm is after a predefined time. Some algorithms may be guaranteed to converge to optimal behavior across many time steps. However, an agent that reaches an acceptable level of optimality after a given time horizon may be preferable to one that ultimately reaches optimality but takes a long time.`,id:`Level of Performance After Some Time`}],models:[{description:`A Reinforcement Learning model trained on expert data from the Gym Hopper environment`,id:`edbeeching/decision-transformer-gym-hopper-expert`},{description:`A PPO agent playing seals/CartPole-v0 using the stable-baselines3 library and the RL Zoo.`,id:`HumanCompatibleAI/ppo-seals-CartPole-v0`}],spaces:[{description:`An application for a cute puppy agent learning to catch a stick.`,id:`ThomasSimonini/Huggy`},{description:`An application to play Snowball Fight with a reinforcement learning agent.`,id:`ThomasSimonini/SnowballFight`}],summary:`Reinforcement learning is the computational approach of learning from action by interacting with an environment through trial and error and receiving rewards (negative or positive) as feedback`,widgetModels:[],youtubeId:`q0BiUn5LiBc`},ha={datasets:[{description:`A famous question answering dataset based on English articles from Wikipedia.`,id:`squad_v2`},{description:`A dataset of aggregated anonymized actual queries issued to the Google search engine.`,id:`natural_questions`}],demo:{inputs:[{label:`Question`,content:`Which name is also used to describe the Amazon rainforest in English?`,type:`text`},{label:`Context`,content:`The Amazon rainforest, also known in English as Amazonia or the Amazon Jungle`,type:`text`}],outputs:[{label:`Answer`,content:`Amazonia`,type:`text`}]},metrics:[{description:`Exact Match is a metric based on the strict character match of the predicted answer and the right answer. For answers predicted correctly, the Exact Match will be 1. Even if only one character is different, Exact Match will be 0`,id:`exact-match`},{description:` The F1-Score metric is useful if we value both false positives and false negatives equally. The F1-Score is calculated on each word in the predicted sequence against the correct answer`,id:`f1`}],models:[{description:`A robust baseline model for most question answering domains.`,id:`deepset/roberta-base-squad2`},{description:`Small yet robust model that can answer questions.`,id:`distilbert/distilbert-base-cased-distilled-squad`},{description:`A special model that can answer questions from tables.`,id:`google/tapas-base-finetuned-wtq`}],spaces:[{description:`An application that can answer a long question from Wikipedia.`,id:`deepset/wikipedia-assistant`}],summary:`Question Answering models can retrieve the answer to a question from a given text, which is useful for searching for an answer in a document. Some question answering models can generate answers without context!`,widgetModels:[`deepset/roberta-base-squad2`],youtubeId:`ajPx5LwJD-I`},ga={datasets:[{description:`Bing queries with relevant passages from various web sources.`,id:`microsoft/ms_marco`}],demo:{inputs:[{label:`Source sentence`,content:`Machine learning is so easy.`,type:`text`},{label:`Sentences to compare to`,content:`Deep learning is so straightforward.`,type:`text`},{label:``,content:`This is so difficult, like rocket science.`,type:`text`},{label:``,content:`I can't believe how much I struggled with this.`,type:`text`}],outputs:[{type:`chart`,data:[{label:`Deep learning is so straightforward.`,score:.623},{label:`This is so difficult, like rocket science.`,score:.413},{label:`I can't believe how much I struggled with this.`,score:.256}]}]},metrics:[{description:`Reciprocal Rank is a measure used to rank the relevancy of documents given a set of documents. Reciprocal Rank is the reciprocal of the rank of the document retrieved, meaning, if the rank is 3, the Reciprocal Rank is 0.33. If the rank is 1, the Reciprocal Rank is 1`,id:`Mean Reciprocal Rank`},{description:`The similarity of the embeddings is evaluated mainly on cosine similarity. It is calculated as the cosine of the angle between two vectors. It is particularly useful when your texts are not the same length`,id:`Cosine Similarity`}],models:[{description:`This model works well for sentences and paragraphs and can be used for clustering/grouping and semantic searches.`,id:`sentence-transformers/all-mpnet-base-v2`},{description:`A multilingual robust sentence similarity model.`,id:`BAAI/bge-m3`},{description:`A robust sentence similarity model.`,id:`HIT-TMG/KaLM-embedding-multilingual-mini-instruct-v1.5`}],spaces:[{description:`An application that leverages sentence similarity to answer questions from YouTube videos.`,id:`Gradio-Blocks/Ask_Questions_To_YouTube_Videos`},{description:`An application that retrieves relevant PubMed abstracts for a given online article which can be used as further references.`,id:`Gradio-Blocks/pubmed-abstract-retriever`},{description:`An application that leverages sentence similarity to summarize text.`,id:`nickmuchi/article-text-summarizer`},{description:`A guide that explains how Sentence Transformers can be used for semantic search.`,id:`sentence-transformers/Sentence_Transformers_for_semantic_search`}],summary:`Sentence Similarity is the task of determining how similar two texts are. Sentence similarity models convert input texts into vectors (embeddings) that capture semantic information and calculate how close (similar) they are between them. This task is particularly useful for information retrieval and clustering/grouping.`,widgetModels:[`sentence-transformers/all-MiniLM-L6-v2`],youtubeId:`VCZq5AkbNEU`},_a={canonicalId:`text-generation`,datasets:[{description:`News articles in five different languages along with their summaries. Widely used for benchmarking multilingual summarization models.`,id:`mlsum`},{description:`English conversations and their summaries. Useful for benchmarking conversational agents.`,id:`samsum`}],demo:{inputs:[{label:`Input`,content:`The tower is 324 metres (1,063 ft) tall, about the same height as an 81-storey building, and the tallest structure in Paris. Its base is square, measuring 125 metres (410 ft) on each side. It was the first structure to reach a height of 300 metres. Excluding transmitters, the Eiffel Tower is the second tallest free-standing structure in France after the Millau Viaduct.`,type:`text`}],outputs:[{label:`Output`,content:`The tower is 324 metres (1,063 ft) tall, about the same height as an 81-storey building. It was the first structure to reach a height of 300 metres.`,type:`text`}]},metrics:[{description:`The generated sequence is compared against its summary, and the overlap of tokens are counted. ROUGE-N refers to overlap of N subsequent tokens, ROUGE-1 refers to overlap of single tokens and ROUGE-2 is the overlap of two subsequent tokens.`,id:`rouge`}],models:[{description:`A strong summarization model trained on English news articles. Excels at generating factual summaries.`,id:`facebook/bart-large-cnn`},{description:`A summarization model trained on medical articles.`,id:`Falconsai/medical_summarization`}],spaces:[{description:`An application that can summarize long paragraphs.`,id:`pszemraj/summarize-long-text`},{description:`A much needed summarization application for terms and conditions.`,id:`ml6team/distilbart-tos-summarizer-tosdr`},{description:`An application that summarizes long documents.`,id:`pszemraj/document-summarization`},{description:`An application that can detect errors in abstractive summarization.`,id:`ml6team/post-processing-summarization`}],summary:`Summarization is the task of producing a shorter version of a document while preserving its important information. Some models can extract text from the original input, while other models can generate entirely new text.`,widgetModels:[`facebook/bart-large-cnn`],youtubeId:`yHnr5Dk2zCI`},va={datasets:[{description:`The WikiTableQuestions dataset is a large-scale dataset for the task of question answering on semi-structured tables.`,id:`wikitablequestions`},{description:`WikiSQL is a dataset of 80654 hand-annotated examples of questions and SQL queries distributed across 24241 tables from Wikipedia.`,id:`wikisql`}],demo:{inputs:[{table:[[`Rank`,`Name`,`No.of reigns`,`Combined days`],[`1`,`lou Thesz`,`3`,`3749`],[`2`,`Ric Flair`,`8`,`3103`],[`3`,`Harley Race`,`7`,`1799`]],type:`tabular`},{label:`Question`,content:`What is the number of reigns for Harley Race?`,type:`text`}],outputs:[{label:`Result`,content:`7`,type:`text`}]},metrics:[{description:`Checks whether the predicted answer(s) is the same as the ground-truth answer(s).`,id:`Denotation Accuracy`}],models:[{description:`A table question answering model that is capable of neural SQL execution, i.e., employ TAPEX to execute a SQL query on a given table.`,id:`microsoft/tapex-base`},{description:`A robust table question answering model.`,id:`google/tapas-base-finetuned-wtq`}],spaces:[{description:`An application that answers questions based on table CSV files.`,id:`katanaml/table-query`}],summary:`Table Question Answering (Table QA) is the answering a question about an information on a given table.`,widgetModels:[`google/tapas-base-finetuned-wtq`]},ya={datasets:[{description:`A comprehensive curation of datasets covering all benchmarks.`,id:`inria-soda/tabular-benchmark`}],demo:{inputs:[{table:[[`Glucose`,`Blood Pressure `,`Skin Thickness`,`Insulin`,`BMI`],[`148`,`72`,`35`,`0`,`33.6`],[`150`,`50`,`30`,`0`,`35.1`],[`141`,`60`,`29`,`1`,`39.2`]],type:`tabular`}],outputs:[{table:[[`Diabetes`],[`1`],[`1`],[`0`]],type:`tabular`}]},metrics:[{description:``,id:`accuracy`},{description:``,id:`recall`},{description:``,id:`precision`},{description:``,id:`f1`}],models:[{description:`Breast cancer prediction model based on decision trees.`,id:`scikit-learn/cancer-prediction-trees`}],spaces:[{description:`An application that can predict defective products on a production line.`,id:`scikit-learn/tabular-playground`},{description:`An application that compares various tabular classification techniques on different datasets.`,id:`scikit-learn/classification`}],summary:`Tabular classification is the task of classifying a target category (a group) based on set of attributes.`,widgetModels:[`scikit-learn/tabular-playground`],youtubeId:``},ba={datasets:[{description:`A comprehensive curation of datasets covering all benchmarks.`,id:`inria-soda/tabular-benchmark`}],demo:{inputs:[{table:[[`Car Name`,`Horsepower`,`Weight`],[`ford torino`,`140`,`3,449`],[`amc hornet`,`97`,`2,774`],[`toyota corolla`,`65`,`1,773`]],type:`tabular`}],outputs:[{table:[[`MPG (miles per gallon)`],[`17`],[`18`],[`31`]],type:`tabular`}]},metrics:[{description:``,id:`mse`},{description:`Coefficient of determination (or R-squared) is a measure of how well the model fits the data. Higher R-squared is considered a better fit.`,id:`r-squared`}],models:[{description:`Fish weight prediction based on length measurements and species.`,id:`scikit-learn/Fish-Weight`}],spaces:[{description:`An application that can predict weight of a fish based on set of attributes.`,id:`scikit-learn/fish-weight-prediction`}],summary:`Tabular regression is the task of predicting a numerical value given a set of attributes.`,widgetModels:[`scikit-learn/Fish-Weight`],youtubeId:``},xa={datasets:[{description:`RedCaps is a large-scale dataset of 12M image-text pairs collected from Reddit.`,id:`red_caps`},{description:`Conceptual Captions is a dataset consisting of ~3.3M images annotated with captions.`,id:`conceptual_captions`},{description:`12M image-caption pairs.`,id:`Spawning/PD12M`}],demo:{inputs:[{label:`Input`,content:`A city above clouds, pastel colors, Victorian style`,type:`text`}],outputs:[{filename:`image.jpeg`,type:`img`}]},metrics:[{description:`The Inception Score (IS) measure assesses diversity and meaningfulness. It uses a generated image sample to predict its label. A higher score signifies more diverse and meaningful images.`,id:`IS`},{description:`The Fréchet Inception Distance (FID) calculates the distance between distributions between synthetic and real samples. A lower FID score indicates better similarity between the distributions of real and generated images.`,id:`FID`},{description:`R-precision assesses how the generated image aligns with the provided text description. It uses the generated images as queries to retrieve relevant text descriptions. The top 'r' relevant descriptions are selected and used to calculate R-precision as r/R, where 'R' is the number of ground truth descriptions associated with the generated images. A higher R-precision value indicates a better model.`,id:`R-Precision`}],models:[{description:`One of the most powerful image generation models that can generate realistic outputs.`,id:`black-forest-labs/FLUX.1-Krea-dev`},{description:`A powerful image generation model.`,id:`Qwen/Qwen-Image`},{description:`Powerful and fast image generation model.`,id:`ByteDance/SDXL-Lightning`},{description:`A powerful text-to-image model.`,id:`ByteDance/Hyper-SD`}],spaces:[{description:`A powerful text-to-image application.`,id:`stabilityai/stable-diffusion-3-medium`},{description:`A text-to-image application to generate comics.`,id:`jbilcke-hf/ai-comic-factory`},{description:`An application to match multiple custom image generation models.`,id:`multimodalart/flux-lora-lab`},{description:`A powerful yet very fast image generation application.`,id:`latent-consistency/lcm-lora-for-sdxl`},{description:`A gallery to explore various text-to-image models.`,id:`multimodalart/LoraTheExplorer`},{description:"An application for `text-to-image`, `image-to-image` and image inpainting.",id:`ArtGAN/Stable-Diffusion-ControlNet-WebUI`},{description:`An application to generate realistic images given photos of a person and a prompt.`,id:`InstantX/InstantID`}],summary:`Text-to-image is the task of generating images from input text. These pipelines can also be used to modify and edit images based on text prompts.`,widgetModels:[`black-forest-labs/FLUX.1-dev`],youtubeId:``},Sa={canonicalId:`text-to-audio`,datasets:[{description:`10K hours of multi-speaker English dataset.`,id:`parler-tts/mls_eng_10k`},{description:`Multi-speaker English dataset.`,id:`mythicinfinity/libritts_r`},{description:`Multi-lingual dataset.`,id:`facebook/multilingual_librispeech`}],demo:{inputs:[{label:`Input`,content:`I love audio models on the Hub!`,type:`text`}],outputs:[{filename:`audio.wav`,type:`audio`}]},metrics:[{description:`The Mel Cepstral Distortion (MCD) metric is used to calculate the quality of generated speech.`,id:`mel cepstral distortion`}],models:[{description:`Small yet powerful TTS model.`,id:`KittenML/kitten-tts-nano-0.1`},{description:`Bleeding edge TTS model.`,id:`ResembleAI/chatterbox`},{description:`A massively multi-lingual TTS model.`,id:`fishaudio/fish-speech-1.5`},{description:`A text-to-dialogue model.`,id:`nari-labs/Dia-1.6B-0626`}],spaces:[{description:`An application for generate high quality speech in different languages.`,id:`hexgrad/Kokoro-TTS`},{description:`A multilingual text-to-speech application.`,id:`fishaudio/fish-speech-1`},{description:`Performant TTS application.`,id:`ResembleAI/Chatterbox`},{description:`An application to compare different TTS models.`,id:`TTS-AGI/TTS-Arena-V2`},{description:`An application that generates podcast episodes.`,id:`ngxson/kokoro-podcast-generator`}],summary:`Text-to-Speech (TTS) is the task of generating natural sounding speech given text input. TTS models can be extended to have a single model that generates speech for multiple speakers and multiple languages.`,widgetModels:[`suno/bark`],youtubeId:`NW62DpzJ274`},Ca={datasets:[{description:`A widely used dataset useful to benchmark named entity recognition models.`,id:`eriktks/conll2003`},{description:`A multilingual dataset of Wikipedia articles annotated for named entity recognition in over 150 different languages.`,id:`unimelb-nlp/wikiann`}],demo:{inputs:[{label:`Input`,content:`My name is Omar and I live in Zürich.`,type:`text`}],outputs:[{text:`My name is Omar and I live in Zürich.`,tokens:[{type:`PERSON`,start:11,end:15},{type:`GPE`,start:30,end:36}],type:`text-with-tokens`}]},metrics:[{description:``,id:`accuracy`},{description:``,id:`recall`},{description:``,id:`precision`},{description:``,id:`f1`}],models:[{description:`A robust performance model to identify people, locations, organizations and names of miscellaneous entities.`,id:`dslim/bert-base-NER`},{description:`A strong model to identify people, locations, organizations and names in multiple languages.`,id:`FacebookAI/xlm-roberta-large-finetuned-conll03-english`},{description:`A token classification model specialized on medical entity recognition.`,id:`blaze999/Medical-NER`},{description:`Flair models are typically the state of the art in named entity recognition tasks.`,id:`flair/ner-english`}],spaces:[{description:`An application that can recognizes entities, extracts noun chunks and recognizes various linguistic features of each token.`,id:`spacy/gradio_pipeline_visualizer`}],summary:`Token classification is a natural language understanding task in which a label is assigned to some tokens in a text. Some popular token classification subtasks are Named Entity Recognition (NER) and Part-of-Speech (PoS) tagging. NER models could be trained to identify specific entities in a text, such as dates, individuals and places; and PoS tagging would identify, for example, which words in a text are verbs, nouns, and punctuation marks.`,widgetModels:[`FacebookAI/xlm-roberta-large-finetuned-conll03-english`],youtubeId:`wVHdVlPScxA`},wa={canonicalId:`text-generation`,datasets:[{description:`A dataset of copyright-free books translated into 16 different languages.`,id:`Helsinki-NLP/opus_books`},{description:`An example of translation between programming languages. This dataset consists of functions in Java and C#.`,id:`google/code_x_glue_cc_code_to_code_trans`}],demo:{inputs:[{label:`Input`,content:`My name is Omar and I live in Zürich.`,type:`text`}],outputs:[{label:`Output`,content:`Mein Name ist Omar und ich wohne in Zürich.`,type:`text`}]},metrics:[{description:`BLEU score is calculated by counting the number of shared single or subsequent tokens between the generated sequence and the reference. Subsequent n tokens are called “n-grams”. Unigram refers to a single token while bi-gram refers to token pairs and n-grams refer to n subsequent tokens. The score ranges from 0 to 1, where 1 means the translation perfectly matched and 0 did not match at all`,id:`bleu`},{description:``,id:`sacrebleu`}],models:[{description:`Very powerful model that can translate many languages between each other, especially low-resource languages.`,id:`facebook/nllb-200-1.3B`},{description:`A general-purpose Transformer that can be used to translate from English to German, French, or Romanian.`,id:`google-t5/t5-base`}],spaces:[{description:`An application that can translate between 100 languages.`,id:`Iker/Translate-100-languages`},{description:`An application that can translate between many languages.`,id:`Geonmo/nllb-translation-demo`}],summary:`Translation is the task of converting text from one language to another.`,widgetModels:[`facebook/mbart-large-50-many-to-many-mmt`],youtubeId:`1JvfrvZgi6c`},Ta={datasets:[{description:`A widely used dataset used to benchmark multiple variants of text classification.`,id:`nyu-mll/glue`},{description:`A text classification dataset used to benchmark natural language inference models`,id:`stanfordnlp/snli`}],demo:{inputs:[{label:`Input`,content:`I love Hugging Face!`,type:`text`}],outputs:[{type:`chart`,data:[{label:`POSITIVE`,score:.9},{label:`NEUTRAL`,score:.1},{label:`NEGATIVE`,score:0}]}]},metrics:[{description:``,id:`accuracy`},{description:``,id:`recall`},{description:``,id:`precision`},{description:`The F1 metric is the harmonic mean of the precision and recall. It can be calculated as: F1 = 2 * (precision * recall) / (precision + recall)`,id:`f1`}],models:[{description:`A robust model trained for sentiment analysis.`,id:`distilbert/distilbert-base-uncased-finetuned-sst-2-english`},{description:`A sentiment analysis model specialized in financial sentiment.`,id:`ProsusAI/finbert`},{description:`A sentiment analysis model specialized in analyzing tweets.`,id:`cardiffnlp/twitter-roberta-base-sentiment-latest`},{description:`A model that can classify languages.`,id:`papluca/xlm-roberta-base-language-detection`},{description:`A model that can classify text generation attacks.`,id:`meta-llama/Prompt-Guard-86M`}],spaces:[{description:`An application that can classify financial sentiment.`,id:`IoannisTr/Tech_Stocks_Trading_Assistant`},{description:`A dashboard that contains various text classification tasks.`,id:`miesnerjacob/Multi-task-NLP`},{description:`An application that analyzes user reviews in healthcare.`,id:`spacy/healthsea-demo`}],summary:`Text Classification is the task of assigning a label or class to a given text. Some use cases are sentiment analysis, natural language inference, and assessing grammatical correctness.`,widgetModels:[`distilbert/distilbert-base-uncased-finetuned-sst-2-english`],youtubeId:`leNG9fN9FQU`},Ea={datasets:[{description:`Multilingual dataset used to evaluate text generation models.`,id:`CohereForAI/Global-MMLU`},{description:`High quality multilingual data used to train text-generation models.`,id:`HuggingFaceFW/fineweb-2`},{description:`Truly open-source, curated and cleaned dialogue dataset.`,id:`HuggingFaceH4/ultrachat_200k`},{description:`A reasoning dataset.`,id:`open-r1/OpenThoughts-114k-math`},{description:`A multilingual instruction dataset with preference ratings on responses.`,id:`allenai/tulu-3-sft-mixture`},{description:`A large synthetic dataset for alignment of text generation models.`,id:`HuggingFaceTB/smoltalk`},{description:`A dataset made for training text generation models solving math questions.`,id:`HuggingFaceTB/finemath`}],demo:{inputs:[{label:`Input`,content:`Once upon a time,`,type:`text`}],outputs:[{label:`Output`,content:`Once upon a time, we knew that our ancestors were on the verge of extinction. The great explorers and poets of the Old World, from Alexander the Great to Chaucer, are dead and gone. A good many of our ancient explorers and poets have`,type:`text`}]},metrics:[{description:`Cross Entropy is a metric that calculates the difference between two probability distributions. Each probability distribution is the distribution of predicted words`,id:`Cross Entropy`},{description:`The Perplexity metric is the exponential of the cross-entropy loss. It evaluates the probabilities assigned to the next word by the model. Lower perplexity indicates better performance`,id:`Perplexity`}],models:[{description:`A text-generation model trained to follow instructions.`,id:`google/gemma-2-2b-it`},{description:`Powerful text generation model for coding.`,id:`Qwen/Qwen3-Coder-480B-A35B-Instruct`},{description:`Great text generation model with top-notch tool calling capabilities.`,id:`openai/gpt-oss-120b`},{description:`Powerful text generation model.`,id:`zai-org/GLM-4.5`},{description:`A powerful small model with reasoning capabilities.`,id:`Qwen/Qwen3-4B-Thinking-2507`},{description:`Strong conversational model that supports very long instructions.`,id:`Qwen/Qwen2.5-7B-Instruct-1M`},{description:`Text generation model used to write code.`,id:`Qwen/Qwen2.5-Coder-32B-Instruct`},{description:`Powerful reasoning based open large language model.`,id:`deepseek-ai/DeepSeek-R1`}],spaces:[{description:`An application that writes and executes code from text instructions and supports many models.`,id:`akhaliq/anycoder`},{description:`An application that builds websites from natural language prompts.`,id:`enzostvs/deepsite`},{description:`A leaderboard for comparing chain-of-thought performance of models.`,id:`logikon/open_cot_leaderboard`},{description:`An text generation based application based on a very powerful LLaMA2 model.`,id:`ysharma/Explore_llamav2_with_TGI`},{description:`An text generation based application to converse with Zephyr model.`,id:`HuggingFaceH4/zephyr-chat`},{description:`A leaderboard that ranks text generation models based on blind votes from people.`,id:`lmsys/chatbot-arena-leaderboard`},{description:`An chatbot to converse with a very powerful text generation model.`,id:`mlabonne/phixtral-chat`}],summary:`Generating text is the task of generating new text given another text. These models can, for example, fill in incomplete text or paraphrase.`,widgetModels:[`mistralai/Mistral-Nemo-Instruct-2407`],youtubeId:`e9gNEAlsOvU`},Da={datasets:[{description:`Bing queries with relevant passages from various web sources.`,id:`microsoft/ms_marco`}],demo:{inputs:[{label:`Source sentence`,content:`Machine learning is so easy.`,type:`text`},{label:`Sentences to compare to`,content:`Deep learning is so straightforward.`,type:`text`},{label:``,content:`This is so difficult, like rocket science.`,type:`text`},{label:``,content:`I can't believe how much I struggled with this.`,type:`text`}],outputs:[{type:`chart`,data:[{label:`Deep learning is so straightforward.`,score:2.2006407},{label:`This is so difficult, like rocket science.`,score:-6.2634873},{label:`I can't believe how much I struggled with this.`,score:-10.251488}]}]},metrics:[{description:`Discounted Cumulative Gain (DCG) measures the gain, or usefulness, of search results discounted by their position. The normalization is done by dividing the DCG by the ideal DCG, which is the DCG of the perfect ranking.`,id:`Normalized Discounted Cumulative Gain`},{description:`Reciprocal Rank is a measure used to rank the relevancy of documents given a set of documents. Reciprocal Rank is the reciprocal of the rank of the document retrieved, meaning, if the rank is 3, the Reciprocal Rank is 0.33. If the rank is 1, the Reciprocal Rank is 1`,id:`Mean Reciprocal Rank`},{description:`Mean Average Precision (mAP) is the overall average of the Average Precision (AP) values, where AP is the Area Under the PR Curve (AUC-PR)`,id:`Mean Average Precision`}],models:[{description:`An extremely efficient text ranking model trained on a web search dataset.`,id:`cross-encoder/ms-marco-MiniLM-L6-v2`},{description:`A strong multilingual text reranker model.`,id:`Alibaba-NLP/gte-multilingual-reranker-base`},{description:`An efficient text ranking model that punches above its weight.`,id:`Alibaba-NLP/gte-reranker-modernbert-base`}],spaces:[],summary:`Text Ranking is the task of ranking a set of texts based on their relevance to a query. Text ranking models are trained on large datasets of queries and relevant documents to learn how to rank documents based on their relevance to the query. This task is particularly useful for search engines and information retrieval systems.`,widgetModels:[`cross-encoder/ms-marco-MiniLM-L6-v2`],youtubeId:``},Oa={datasets:[{description:`Microsoft Research Video to Text is a large-scale dataset for open domain video captioning`,id:`iejMac/CLIP-MSR-VTT`},{description:`UCF101 Human Actions dataset consists of 13,320 video clips from YouTube, with 101 classes.`,id:`quchenyuan/UCF101-ZIP`},{description:`A high-quality dataset for human action recognition in YouTube videos.`,id:`nateraw/kinetics`},{description:`A dataset of video clips of humans performing pre-defined basic actions with everyday objects.`,id:`HuggingFaceM4/something_something_v2`},{description:`This dataset consists of text-video pairs and contains noisy samples with irrelevant video descriptions`,id:`HuggingFaceM4/webvid`},{description:`A dataset of short Flickr videos for the temporal localization of events with descriptions.`,id:`iejMac/CLIP-DiDeMo`}],demo:{inputs:[{label:`Input`,content:`Darth Vader is surfing on the waves.`,type:`text`}],outputs:[{filename:`text-to-video-output.gif`,type:`img`}]},metrics:[{description:`Inception Score uses an image classification model that predicts class labels and evaluates how distinct and diverse the images are. A higher score indicates better video generation.`,id:`is`},{description:`Frechet Inception Distance uses an image classification model to obtain image embeddings. The metric compares mean and standard deviation of the embeddings of real and generated images. A smaller score indicates better video generation.`,id:`fid`},{description:`Frechet Video Distance uses a model that captures coherence for changes in frames and the quality of each frame. A smaller score indicates better video generation.`,id:`fvd`},{description:`CLIPSIM measures similarity between video frames and text using an image-text similarity model. A higher score indicates better video generation.`,id:`clipsim`}],models:[{description:`A strong model for consistent video generation.`,id:`tencent/HunyuanVideo`},{description:`A text-to-video model with high fidelity motion and strong prompt adherence.`,id:`Lightricks/LTX-Video`},{description:`A text-to-video model focusing on physics-aware applications like robotics.`,id:`nvidia/Cosmos-1.0-Diffusion-7B-Text2World`},{description:`Very fast model for video generation.`,id:`Lightricks/LTX-Video-0.9.8-13B-distilled`}],spaces:[{description:`An application that generates video from text.`,id:`VideoCrafter/VideoCrafter`},{description:`Consistent video generation application.`,id:`Wan-AI/Wan2.1`},{description:`A cutting edge video generation application.`,id:`Pyramid-Flow/pyramid-flow`}],summary:`Text-to-video models can be used in any application that requires generating consistent sequence of images from text. `,widgetModels:[`Wan-AI/Wan2.2-TI2V-5B`],youtubeId:void 0},ka={datasets:[{description:`The CIFAR-100 dataset consists of 60000 32x32 colour images in 100 classes, with 600 images per class.`,id:`cifar100`},{description:`Multiple images of celebrities, used for facial expression translation.`,id:`CelebA`}],demo:{inputs:[{label:`Seed`,content:`42`,type:`text`},{label:`Number of images to generate:`,content:`4`,type:`text`}],outputs:[{filename:`unconditional-image-generation-output.jpeg`,type:`img`}]},metrics:[{description:`The inception score (IS) evaluates the quality of generated images. It measures the diversity of the generated images (the model predictions are evenly distributed across all possible labels) and their 'distinction' or 'sharpness' (the model confidently predicts a single label for each image).`,id:`Inception score (IS)`},{description:`The Fréchet Inception Distance (FID) evaluates the quality of images created by a generative model by calculating the distance between feature vectors for real and generated images.`,id:`Frećhet Inception Distance (FID)`}],models:[{description:`High-quality image generation model trained on the CIFAR-10 dataset. It synthesizes images of the ten classes presented in the dataset using diffusion probabilistic models, a class of latent variable models inspired by considerations from nonequilibrium thermodynamics.`,id:`google/ddpm-cifar10-32`},{description:`High-quality image generation model trained on the 256x256 CelebA-HQ dataset. It synthesizes images of faces using diffusion probabilistic models, a class of latent variable models inspired by considerations from nonequilibrium thermodynamics.`,id:`google/ddpm-celebahq-256`}],spaces:[{description:`An application that can generate realistic faces.`,id:`CompVis/celeba-latent-diffusion`}],summary:`Unconditional image generation is the task of generating images with no condition in any context (like a prompt text or another image). Once trained, the model will create images that resemble its training data distribution.`,widgetModels:[``],youtubeId:``},Aa={datasets:[{description:`Benchmark dataset used for video classification with videos that belong to 400 classes.`,id:`kinetics400`}],demo:{inputs:[{filename:`video-classification-input.gif`,type:`img`}],outputs:[{type:`chart`,data:[{label:`Playing Guitar`,score:.514},{label:`Playing Tennis`,score:.193},{label:`Cooking`,score:.068}]}]},metrics:[{description:``,id:`accuracy`},{description:``,id:`recall`},{description:``,id:`precision`},{description:``,id:`f1`}],models:[{description:`Strong Video Classification model trained on the Kinetics 400 dataset.`,id:`google/vivit-b-16x2-kinetics400`},{description:`Strong Video Classification model trained on the Kinetics 400 dataset.`,id:`microsoft/xclip-base-patch32`}],spaces:[{description:`An application that classifies video at different timestamps.`,id:`nateraw/lavila`},{description:`An application that classifies video.`,id:`fcakyon/video-classification`}],summary:`Video classification is the task of assigning a label or class to an entire video. Videos are expected to have only one class for each video. Video classification models take a video as input and return a prediction about which class the video belongs to.`,widgetModels:[],youtubeId:``},ja={datasets:[{description:`A large dataset used to train visual document retrieval models.`,id:`vidore/colpali_train_set`}],demo:{inputs:[{filename:`input.png`,type:`img`},{label:`Question`,content:`Is the model in this paper the fastest for inference?`,type:`text`}],outputs:[{type:`chart`,data:[{label:`Page 10`,score:.7},{label:`Page 11`,score:.06},{label:`Page 9`,score:.003}]}]},isPlaceholder:!1,metrics:[{description:`NDCG@k scores ranked recommendation lists for top-k results. 0 is the worst, 1 is the best.`,id:`Normalized Discounted Cumulative Gain at K`}],models:[{description:`Very accurate visual document retrieval model for multilingual queries and documents.`,id:`vidore/colqwen2-v1.0`},{description:`Very fast and efficient visual document retrieval model that can also take in other modalities like audio.`,id:`Tevatron/OmniEmbed-v0.1`}],spaces:[{description:`A leaderboard of visual document retrieval models.`,id:`vidore/vidore-leaderboard`},{description:`Visual retrieval augmented generation demo based on ColQwen2 model.`,id:`vidore/visual-rag-tool`}],summary:`Visual document retrieval is the task of searching for relevant image-based documents, such as PDFs. These models take a text query and multiple documents as input and return the top-most relevant documents and relevancy scores as output.`,widgetModels:[``],youtubeId:``},Ma={datasets:[{description:`A widely used dataset containing questions (with answers) about images.`,id:`Graphcore/vqa`},{description:`A dataset to benchmark visual reasoning based on text in images.`,id:`facebook/textvqa`}],demo:{inputs:[{filename:`elephant.jpeg`,type:`img`},{label:`Question`,content:`What is in this image?`,type:`text`}],outputs:[{type:`chart`,data:[{label:`elephant`,score:.97},{label:`elephants`,score:.06},{label:`animal`,score:.003}]}]},isPlaceholder:!1,metrics:[{description:``,id:`accuracy`},{description:`Measures how much a predicted answer differs from the ground truth based on the difference in their semantic meaning.`,id:`wu-palmer similarity`}],models:[{description:`A visual question answering model trained to convert charts and plots to text.`,id:`google/deplot`},{description:`A visual question answering model trained for mathematical reasoning and chart derendering from images.`,id:`google/matcha-base`},{description:`A strong visual question answering that answers questions from book covers.`,id:`google/pix2struct-ocrvqa-large`}],spaces:[{description:`An application that compares visual question answering models across different tasks.`,id:`merve/pix2struct`},{description:`An application that can answer questions based on images.`,id:`nielsr/vilt-vqa`},{description:`An application that can caption images and answer questions about a given image. `,id:`Salesforce/BLIP`},{description:`An application that can caption images and answer questions about a given image. `,id:`vumichien/Img2Prompt`}],summary:`Visual Question Answering is the task of answering open-ended questions based on an image. They output natural language responses to natural language questions.`,widgetModels:[`dandelin/vilt-b32-finetuned-vqa`],youtubeId:``},Na={datasets:[{description:`A widely used dataset used to benchmark multiple variants of text classification.`,id:`nyu-mll/glue`},{description:`The Multi-Genre Natural Language Inference (MultiNLI) corpus is a crowd-sourced collection of 433k sentence pairs annotated with textual entailment information.`,id:`nyu-mll/multi_nli`},{description:`FEVER is a publicly available dataset for fact extraction and verification against textual sources.`,id:`fever/fever`}],demo:{inputs:[{label:`Text Input`,content:`Dune is the best movie ever.`,type:`text`},{label:`Candidate Labels`,content:`CINEMA, ART, MUSIC`,type:`text`}],outputs:[{type:`chart`,data:[{label:`CINEMA`,score:.9},{label:`ART`,score:.1},{label:`MUSIC`,score:0}]}]},metrics:[],models:[{description:`Powerful zero-shot text classification model.`,id:`facebook/bart-large-mnli`},{description:`Cutting-edge zero-shot multilingual text classification model.`,id:`MoritzLaurer/ModernBERT-large-zeroshot-v2.0`},{description:`Zero-shot text classification model that can be used for topic and sentiment classification.`,id:`knowledgator/gliclass-modern-base-v2.0-init`}],spaces:[],summary:`Zero-shot text classification is a task in natural language processing where a model is trained on a set of labeled examples but is then able to classify new examples from previously unseen classes.`,widgetModels:[`facebook/bart-large-mnli`]},Pa={datasets:[{description:``,id:``}],demo:{inputs:[{filename:`image-classification-input.jpeg`,type:`img`},{label:`Classes`,content:`cat, dog, bird`,type:`text`}],outputs:[{type:`chart`,data:[{label:`Cat`,score:.664},{label:`Dog`,score:.329},{label:`Bird`,score:.008}]}]},metrics:[{description:`Computes the number of times the correct label appears in top K labels predicted`,id:`top-K accuracy`}],models:[{description:`Multilingual image classification model for 80 languages.`,id:`visheratin/mexma-siglip`},{description:`Strong zero-shot image classification model.`,id:`google/siglip2-base-patch16-224`},{description:`Robust zero-shot image classification model.`,id:`intfloat/mmE5-mllama-11b-instruct`},{description:`Powerful zero-shot image classification model supporting 94 languages.`,id:`jinaai/jina-clip-v2`},{description:`Strong image classification model for biomedical domain.`,id:`microsoft/BiomedCLIP-PubMedBERT_256-vit_base_patch16_224`}],spaces:[{description:`An application that leverages zero-shot image classification to find best captions to generate an image. `,id:`pharma/CLIP-Interrogator`},{description:`An application to compare different zero-shot image classification models. `,id:`merve/compare_clip_siglip`}],summary:`Zero-shot image classification is the task of classifying previously unseen classes during training of a model.`,widgetModels:[`google/siglip-so400m-patch14-224`],youtubeId:``},Fa={datasets:[],demo:{inputs:[{filename:`zero-shot-object-detection-input.jpg`,type:`img`},{label:`Classes`,content:`cat, dog, bird`,type:`text`}],outputs:[{filename:`zero-shot-object-detection-output.jpg`,type:`img`}]},metrics:[{description:`The Average Precision (AP) metric is the Area Under the PR Curve (AUC-PR). It is calculated for each class separately`,id:`Average Precision`},{description:`The Mean Average Precision (mAP) metric is the overall average of the AP values`,id:`Mean Average Precision`},{description:`The APα metric is the Average Precision at the IoU threshold of a α value, for example, AP50 and AP75`,id:`APα`}],models:[{description:`Solid zero-shot object detection model.`,id:`openmmlab-community/mm_grounding_dino_large_all`},{description:`Cutting-edge zero-shot object detection model.`,id:`fushh7/LLMDet`}],spaces:[{description:`A demo to compare different zero-shot object detection models per output and latency.`,id:`ariG23498/zero-shot-od`},{description:`A demo that combines a zero-shot object detection and mask generation model for zero-shot segmentation.`,id:`merve/OWLSAM`}],summary:`Zero-shot object detection is a computer vision task to detect objects and their classes in images, without any prior training or knowledge of the classes. Zero-shot object detection models receive an image as input, as well as a list of candidate classes, and output the bounding boxes and labels where the objects have been detected.`,widgetModels:[],youtubeId:``},Ia={datasets:[{description:`A large dataset of over 10 million 3D objects.`,id:`allenai/objaverse-xl`},{description:`A dataset of isolated object images for evaluating image-to-3D models.`,id:`dylanebert/iso3d`}],demo:{inputs:[{filename:`image-to-3d-image-input.png`,type:`img`}],outputs:[{label:`Result`,content:`image-to-3d-3d-output-filename.glb`,type:`text`}]},metrics:[],models:[{description:`Fast image-to-3D mesh model by Tencent.`,id:`TencentARC/InstantMesh`},{description:`3D world generation model.`,id:`tencent/HunyuanWorld-1`},{description:`A scaled up image-to-3D mesh model derived from TripoSR.`,id:`hwjiang/Real3D`},{description:`Consistent image-to-3d generation model.`,id:`stabilityai/stable-point-aware-3d`}],spaces:[{description:`Leaderboard to evaluate image-to-3D models.`,id:`dylanebert/3d-arena`},{description:`Image-to-3D demo with mesh outputs.`,id:`TencentARC/InstantMesh`},{description:`Image-to-3D demo.`,id:`stabilityai/stable-point-aware-3d`},{description:`Image-to-3D demo with mesh outputs.`,id:`hwjiang/Real3D`},{description:`Image-to-3D demo with splat outputs.`,id:`dylanebert/LGM-mini`}],summary:`Image-to-3D models take in image input and produce 3D output.`,widgetModels:[],youtubeId:``},La={datasets:[{description:`A large dataset of over 10 million 3D objects.`,id:`allenai/objaverse-xl`},{description:`Descriptive captions for 3D objects in Objaverse.`,id:`tiange/Cap3D`}],demo:{inputs:[{label:`Prompt`,content:`a cat statue`,type:`text`}],outputs:[{label:`Result`,content:`text-to-3d-3d-output-filename.glb`,type:`text`}]},metrics:[],models:[{description:`Text-to-3D mesh model by OpenAI`,id:`openai/shap-e`},{description:`Generative 3D gaussian splatting model.`,id:`ashawkey/LGM`}],spaces:[{description:`Text-to-3D demo with mesh outputs.`,id:`hysts/Shap-E`},{description:`Text/image-to-3D demo with splat outputs.`,id:`ashawkey/LGM`}],summary:`Text-to-3D models take in text input and produce 3D output.`,widgetModels:[],youtubeId:``},Ra={datasets:[{description:`A dataset of hand keypoints of over 500k examples.`,id:`Vincent-luo/hagrid-mediapipe-hands`}],demo:{inputs:[{filename:`keypoint-detection-input.png`,type:`img`}],outputs:[{filename:`keypoint-detection-output.png`,type:`img`}]},metrics:[],models:[{description:`A robust keypoint detection model.`,id:`magic-leap-community/superpoint`},{description:`A robust keypoint matching model.`,id:`magic-leap-community/superglue_outdoor`},{description:`Strong keypoint detection model used to detect human pose.`,id:`qualcomm/RTMPose-Body2d`},{description:`Powerful keypoint matching model.`,id:`ETH-CVG/lightglue_disk`}],spaces:[{description:`An application that detects hand keypoints in real-time.`,id:`datasciencedojo/Hand-Keypoint-Detection-Realtime`},{description:`An application for keypoint detection and matching.`,id:`ETH-CVG/LightGlue`}],summary:`Keypoint detection is the task of identifying meaningful distinctive points or features in an image.`,widgetModels:[],youtubeId:``},za={datasets:[{description:`Multiple-choice questions and answers about videos.`,id:`lmms-lab/Video-MME`},{description:`A dataset of instructions and question-answer pairs about videos.`,id:`lmms-lab/VideoChatGPT`},{description:`Large video understanding dataset.`,id:`HuggingFaceFV/finevideo`}],demo:{inputs:[{filename:`video-text-to-text-input.gif`,type:`img`},{label:`Text Prompt`,content:`What is happening in this video?`,type:`text`}],outputs:[{label:`Answer`,content:`The video shows a series of images showing a fountain with water jets and a variety of colorful flowers and butterflies in the background.`,type:`text`}]},metrics:[],models:[{description:`A robust video-text-to-text model.`,id:`Vision-CAIR/LongVU_Qwen2_7B`},{description:`Strong video-text-to-text model with reasoning capabilities.`,id:`GoodiesHere/Apollo-LMMs-Apollo-7B-t32`},{description:`Strong video-text-to-text model.`,id:`HuggingFaceTB/SmolVLM2-2.2B-Instruct`}],spaces:[{description:`An application to chat with a video-text-to-text model.`,id:`llava-hf/video-llava`},{description:`A leaderboard for various video-text-to-text models.`,id:`opencompass/openvlm_video_leaderboard`},{description:`An application to generate highlights from a video.`,id:`HuggingFaceTB/SmolVLM2-HighlightGenerator`}],summary:`Video-text-to-text models take in a video and a text prompt and output text. These models are also called video-language models.`,widgetModels:[``],youtubeId:``},Ba={datasets:[{description:`Dataset with detailed annotations for training and benchmarking video instance editing.`,id:`suimu/VIRESET`},{description:`Dataset to evaluate models on long video generation and understanding.`,id:`zhangsh2001/LongV-EVAL`},{description:`Collection of 104 demo videos from the SeedVR/SeedVR2 series showcasing model outputs.`,id:`Iceclear/SeedVR_VideoDemos`}],demo:{inputs:[{filename:`input.gif`,type:`img`}],outputs:[{filename:`output.gif`,type:`img`}]},metrics:[],models:[{description:`Model for editing outfits, character, and scenery in videos.`,id:`decart-ai/Lucy-Edit-Dev`},{description:`Framework that uses 3D mesh proxies for precise, consistent video editing.`,id:`LeoLau/Shape-for-Motion`},{description:`Model for generating physics-aware videos from input videos and control conditions.`,id:`nvidia/Cosmos-Transfer2.5-2B`},{description:`A model to upscale videos at input, designed for seamless use with ComfyUI.`,id:`numz/SeedVR2_comfyUI`}],spaces:[{description:`Interactive demo space for Lucy-Edit-Dev video editing.`,id:`decart-ai/lucy-edit-dev`},{description:`Demo space for SeedVR2-3B showcasing video upscaling and restoration.`,id:`ByteDance-Seed/SeedVR2-3B`}],summary:`Video-to-video models take one or more videos as input and generate new videos as output. They can enhance quality, interpolate frames, modify styles, or create new motion dynamics, enabling creative applications, video production, and research.`,widgetModels:[],youtubeId:``},Va={"audio-classification":[`speechbrain`,`transformers`,`transformers.js`],"audio-to-audio":[`asteroid`,`fairseq`,`speechbrain`],"automatic-speech-recognition":[`espnet`,`nemo`,`speechbrain`,`transformers`,`transformers.js`],"audio-text-to-text":[`transformers`],"depth-estimation":[`transformers`,`transformers.js`],"document-question-answering":[`transformers`,`transformers.js`],"feature-extraction":[`sentence-transformers`,`transformers`,`transformers.js`],"fill-mask":[`transformers`,`transformers.js`],"graph-ml":[`transformers`],"image-classification":[`keras`,`timm`,`transformers`,`transformers.js`],"image-feature-extraction":[`timm`,`transformers`],"image-segmentation":[`transformers`,`transformers.js`],"image-text-to-text":[`transformers`],"image-text-to-image":[`diffusers`],"image-text-to-video":[`diffusers`],"image-to-image":[`diffusers`,`transformers`,`transformers.js`],"image-to-text":[`transformers`,`transformers.js`],"image-to-video":[`diffusers`],"keypoint-detection":[`transformers`],"video-classification":[`transformers`],"mask-generation":[`transformers`],"multiple-choice":[`transformers`],"object-detection":[`transformers`,`transformers.js`,`ultralytics`],other:[],"question-answering":[`adapter-transformers`,`allennlp`,`transformers`,`transformers.js`],robotics:[],"reinforcement-learning":[`transformers`,`stable-baselines3`,`ml-agents`,`sample-factory`],"sentence-similarity":[`sentence-transformers`,`spacy`,`transformers.js`],summarization:[`transformers`,`transformers.js`],"table-question-answering":[`transformers`],"table-to-text":[`transformers`],"tabular-classification":[`sklearn`],"tabular-regression":[`sklearn`],"tabular-to-text":[`transformers`],"text-classification":[`adapter-transformers`,`setfit`,`spacy`,`transformers`,`transformers.js`],"text-generation":[`transformers`,`transformers.js`],"text-ranking":[`sentence-transformers`,`transformers`],"text-retrieval":[],"text-to-image":[`diffusers`],"text-to-speech":[`espnet`,`tensorflowtts`,`transformers`,`transformers.js`],"text-to-audio":[`transformers`,`transformers.js`],"text-to-video":[`diffusers`],"time-series-forecasting":[],"token-classification":[`adapter-transformers`,`flair`,`spacy`,`span-marker`,`stanza`,`transformers`,`transformers.js`],translation:[`transformers`,`transformers.js`],"unconditional-image-generation":[`diffusers`],"video-text-to-text":[`transformers`],"visual-question-answering":[`transformers`,`transformers.js`],"voice-activity-detection":[],"zero-shot-classification":[`transformers`,`transformers.js`],"zero-shot-image-classification":[`transformers`,`transformers.js`],"zero-shot-object-detection":[`transformers`,`transformers.js`],"text-to-3d":[`diffusers`],"image-to-3d":[`diffusers`],"any-to-any":[`transformers`],"visual-document-retrieval":[`transformers`],"video-to-video":[`diffusers`]};function J(e,t=pa){return{...t,id:e,label:Gi[e].name,libraries:Va[e]}}J(`any-to-any`,qi),J(`audio-classification`,Ji),J(`audio-to-audio`,Xi),J(`audio-text-to-text`,Yi),J(`automatic-speech-recognition`,Zi),J(`depth-estimation`,fa),J(`document-question-answering`,Qi),J(`visual-document-retrieval`,ja),J(`feature-extraction`,$i),J(`fill-mask`,ea),J(`image-classification`,ta),J(`image-feature-extraction`,na),J(`image-segmentation`,ca),J(`image-to-image`,ra),J(`image-text-to-text`,aa),J(`image-text-to-image`,oa),J(`image-text-to-video`,sa),J(`image-to-text`,ia),J(`image-to-video`,la),J(`keypoint-detection`,Ra),J(`mask-generation`,ua),J(`object-detection`,da),J(`video-classification`,Aa),J(`question-answering`,ha),J(`reinforcement-learning`,ma),J(`sentence-similarity`,ga),J(`summarization`,_a),J(`table-question-answering`,va),J(`tabular-classification`,ya),J(`tabular-regression`,ba),J(`text-classification`,Ta),J(`text-generation`,Ea),J(`text-ranking`,Da),J(`text-to-image`,xa),J(`text-to-speech`,Sa),J(`text-to-video`,Oa),J(`token-classification`,Ca),J(`translation`,wa),J(`unconditional-image-generation`,ka),J(`video-text-to-text`,za),J(`video-to-video`,Ba),J(`visual-question-answering`,Ma),J(`zero-shot-classification`,Na),J(`zero-shot-image-classification`,Pa),J(`zero-shot-object-detection`,Fa),J(`text-to-3d`,La),J(`image-to-3d`,Ia);var Ha=()=>`"Hi, I recently bought a device from your company but it is not working as advertised and I would like to get reimbursed!"`,Ua=()=>`"Меня зовут Вольфганг и я живу в Берлине"`,Wa=()=>`"The tower is 324 metres (1,063 ft) tall, about the same height as an 81-storey building, and the tallest structure in Paris. Its base is square, measuring 125 metres (410 ft) on each side. During its construction, the Eiffel Tower surpassed the Washington Monument to become the tallest man-made structure in the world, a title it held for 41 years until the Chrysler Building in New York City was finished in 1930. It was the first structure to reach a height of 300 metres. Due to the addition of a broadcasting aerial at the top of the tower in 1957, it is now taller than the Chrysler Building by 5.2 metres (17 ft). Excluding transmitters, the Eiffel Tower is the second tallest free-standing structure in France after the Millau Viaduct."`,Ga=()=>`{
    "query": "How many stars does the transformers repository have?",
    "table": {
        "Repository": ["Transformers", "Datasets", "Tokenizers"],
        "Stars": ["36542", "4512", "3934"],
        "Contributors": ["651", "77", "34"],
        "Programming language": [
            "Python",
            "Python",
            "Rust, Python and NodeJS"
        ]
    }
}`,Ka=()=>`{
        "image": "cat.png",
        "question": "What is in this image?"
    }`,qa=()=>`{
    "question": "What is my name?",
    "context": "My name is Clara and I live in Berkeley."
}`,Ja=()=>`"I like you. I love you"`,Ya=()=>`"My name is Sarah Jessica Parker but you can call me Jessica"`,Xa=e=>e.tags.includes(`conversational`)?e.pipeline_tag===`text-generation`?[{role:`user`,content:`What is the capital of France?`}]:[{role:`user`,content:[{type:`text`,text:`Describe this image in one sentence.`},{type:`image_url`,image_url:{url:`https://cdn.britannica.com/61/93061-050-99147DCE/Statue-of-Liberty-Island-New-York-Bay.jpg`}}]}]:`"Can you please let us know more details about your "`,Za=e=>`"The answer to the universe is ${e.mask_token}."`,Qa=()=>`{
    "source_sentence": "That is a happy person",
    "sentences": [
        "That is a happy dog",
        "That is a very happy person",
        "Today is a sunny day"
    ]
}`,$a=()=>`"Today is a sunny day and I will get some ice cream."`,eo=()=>`"cats.jpg"`,to=()=>`"cats.jpg"`,no=()=>`{
    "image": "cat.png",
    "prompt": "Turn the cat into a tiger."
}`,ro=()=>`{
    "image": "cat.png",
    "prompt": "The cat starts to dance"
}`,io=()=>`{
    "image": "cat.png",
    "prompt": "Turn the cat into a tiger."
}`,ao=()=>`{
    "image": "cat.png",
    "prompt": "The cat starts to dance"
}`,oo=()=>`"cats.jpg"`,so=()=>`"cats.jpg"`,co=()=>`"sample1.flac"`,lo=()=>`"sample1.flac"`,uo=()=>`"Astronaut riding a horse"`,fo=()=>`"A young man walking on the street"`,po=()=>`"The answer to the universe is 42"`,mo=()=>`"liquid drum and bass, atmospheric synths, airy sounds"`,ho=()=>`"sample1.flac"`,go=()=>`'{"Height":[11.52,12.48],"Length1":[23.2,24.0],"Length2":[25.4,26.3],"Species": ["Bream","Bream"]}'`,_o={"audio-to-audio":co,"audio-classification":lo,"automatic-speech-recognition":ho,"document-question-answering":Ka,"feature-extraction":$a,"fill-mask":Za,"image-classification":eo,"image-to-text":to,"image-to-image":no,"image-to-video":ro,"image-text-to-image":io,"image-text-to-video":ao,"image-segmentation":oo,"object-detection":so,"question-answering":qa,"sentence-similarity":Qa,summarization:Wa,"table-question-answering":Ga,"tabular-regression":go,"tabular-classification":go,"text-classification":Ja,"text-generation":Xa,"image-text-to-text":Xa,"text-to-image":uo,"text-to-video":fo,"text-to-speech":po,"text-to-audio":mo,"token-classification":Ya,translation:Ua,"zero-shot-classification":Ha,"zero-shot-image-classification":()=>`"cats.jpg"`};function vo(e,t=!1,n=!1){if(e.pipeline_tag){let r=_o[e.pipeline_tag];if(r){let i=r(e);if(typeof i==`string`&&(t&&(i=i.replace(/(?:(?:\r?\n|\r)\t*)|\t+/g,` `)),n)){let e=i.match(/^"(.+)"$/s);i=e?e[1]:i}return i}}return`No input example has been defined for this model task.`}function yo(e,t){let n=JSON.stringify(e,null,`	`);return t?.indent&&(n=n.replaceAll(`
`,`\n${t.indent}`)),t?.attributeKeyQuotes||(n=n.replace(/"([^"]+)":/g,`$1:`)),t?.customContentEscaper&&(n=t.customContentEscaper(n)),n}var bo=`custom_code`;function Y(e){let t=e.split(`/`);return t.length===1?t[0]:t[1]}var xo=e=>JSON.stringify(e).slice(1,-1),So=e=>[`from adapters import AutoAdapterModel

model = AutoAdapterModel.from_pretrained("${e.config?.adapter_transformers?.model_name}")
model.load_adapter("${e.id}", set_active=True)`],Co=e=>[`import allennlp_models
from allennlp.predictors.predictor import Predictor

predictor = Predictor.from_path("hf://${e.id}")`],wo=e=>[`import allennlp_models
from allennlp.predictors.predictor import Predictor

predictor = Predictor.from_path("hf://${e.id}")
predictor_input = {"passage": "My name is Wolfgang and I live in Berlin", "question": "Where do I live?"}
predictions = predictor.predict_json(predictor_input)`],To=e=>e.tags.includes(`question-answering`)?wo(e):Co(e),Eo=e=>[`from araclip import AraClip

model = AraClip.from_pretrained("${e.id}")`],Do=e=>[`from asteroid.models import BaseModel

model = BaseModel.from_pretrained("${e.id}")`],Oo=e=>[`# Watermark Generator
from audioseal import AudioSeal

model = AudioSeal.load_generator("${e.id}")
# pass a tensor (tensor_wav) of shape (batch, channels, samples) and a sample rate
wav, sr = tensor_wav, 16000

watermark = model.get_watermark(wav, sr)
watermarked_audio = wav + watermark`,`# Watermark Detector
from audioseal import AudioSeal

detector = AudioSeal.load_detector("${e.id}")

result, message = detector.detect_watermark(watermarked_audio, sr)`];function ko(e){return e.cardData?.base_model?.toString()??`fill-in-base-model`}function X(e){let t=e.widgetData?.[0]?.text??e.cardData?.instance_prompt;if(t)return xo(t)}var Ao=e=>[`import requests
from PIL import Image
from ben2 import AutoModel

url = "https://huggingface.co/datasets/mishig/sample_images/resolve/main/teapot.jpg"
image = Image.open(requests.get(url, stream=True).raw)

model = AutoModel.from_pretrained("${e.id}")
model.to("cuda").eval()
foreground = model.inference(image)
`],jo=e=>[`from bertopic import BERTopic

model = BERTopic.load("${e.id}")`],Mo=e=>[`from bm25s.hf import BM25HF

retriever = BM25HF.load_from_hub("${e.id}")`],No=()=>[`# pip install chatterbox-tts
import torchaudio as ta
from chatterbox.tts import ChatterboxTTS

model = ChatterboxTTS.from_pretrained(device="cuda")

text = "Ezreal and Jinx teamed up with Ahri, Yasuo, and Teemo to take down the enemy's Nexus in an epic late-game pentakill."
wav = model.generate(text)
ta.save("test-1.wav", wav, model.sr)

# If you want to synthesize with a different voice, specify the audio prompt
AUDIO_PROMPT_PATH="YOUR_FILE.wav"
wav = model.generate(text, audio_prompt_path=AUDIO_PROMPT_PATH)
ta.save("test-2.wav", wav, model.sr)`],Po=e=>[`pip install chronos-forecasting`,`import pandas as pd
from chronos import BaseChronosPipeline

pipeline = BaseChronosPipeline.from_pretrained("${e.id}", device_map="cuda")

# Load historical data
context_df = pd.read_csv("https://autogluon.s3.us-west-2.amazonaws.com/datasets/timeseries/misc/AirPassengers.csv")

# Generate predictions
pred_df = pipeline.predict_df(
    context_df,
    prediction_length=36,  # Number of steps to forecast
    quantile_levels=[0.1, 0.5, 0.9],  # Quantiles for probabilistic forecast
    id_column="item_id",  # Column identifying different time series
    timestamp_column="Month",  # Column with datetime information
    target="#Passengers",  # Column(s) with time series values to predict
)`],Fo=e=>[`pip install colipri`,`from colipri import get_model
from colipri import get_processor
from colipri import load_sample_ct
from colipri import ZeroShotImageClassificationPipeline

model = get_model().cuda()
processor = get_processor()
pipeline = ZeroShotImageClassificationPipeline("${e.id}", processor)

image = load_sample_ct()

pipeline(image, ["No lung nodules", "Lung nodules"])
`],Io=()=>[`pip install git+https://github.com/SAP-samples/sap-rpt-1-oss`,`# Run a classification task
from sklearn.datasets import load_breast_cancer
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split

from sap_rpt_oss import SAP_RPT_OSS_Classifier

# Load sample data
X, y = load_breast_cancer(return_X_y=True)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.5, random_state=42)

# Initialize a classifier, 8k context and 8-fold bagging gives best performance, reduce if running out of memory
clf = SAP_RPT_OSS_Classifier(max_context_size=8192, bagging=8)

clf.fit(X_train, y_train)

# Predict probabilities
prediction_probabilities = clf.predict_proba(X_test)
# Predict labels
predictions = clf.predict(X_test)
print("Accuracy", accuracy_score(y_test, predictions))`,`# Run a regression task
from sklearn.datasets import fetch_openml
from sklearn.metrics import r2_score
from sklearn.model_selection import train_test_split

from sap_rpt_oss import SAP_RPT_OSS_Regressor

# Load sample data
df = fetch_openml(data_id=531, as_frame=True)
X = df.data
y = df.target.astype(float)

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.5, random_state=42)

# Initialize the regressor, 8k context and 8-fold bagging gives best performance, reduce if running out of memory
regressor = SAP_RPT_OSS_Regressor(max_context_size=8192, bagging=8)

regressor.fit(X_train, y_train)

# Predict on the test set
predictions = regressor.predict(X_test)

r2 = r2_score(y_test, predictions)
print("R² Score:", r2)`],Lo=()=>[`# pip install git+https://github.com/Google-Health/cxr-foundation.git#subdirectory=python

# Load image as grayscale (Stillwaterising, CC0, via Wikimedia Commons)
import requests
from PIL import Image
from io import BytesIO
image_url = "https://upload.wikimedia.org/wikipedia/commons/c/c8/Chest_Xray_PA_3-8-2010.png"
img = Image.open(requests.get(image_url, headers={'User-Agent': 'Demo'}, stream=True).raw).convert('L')

# Run inference
from clientside.clients import make_hugging_face_client
cxr_client = make_hugging_face_client('cxr_model')
print(cxr_client.get_image_embeddings_from_images([img]))`],Ro=e=>{let t,n,r;return t=`<ENCODER>`,n=`<NUMBER_OF_FEATURES>`,r=`<OUT_CHANNELS>`,e.id===`depth-anything/Depth-Anything-V2-Small`?(t=`vits`,n=`64`,r=`[48, 96, 192, 384]`):e.id===`depth-anything/Depth-Anything-V2-Base`?(t=`vitb`,n=`128`,r=`[96, 192, 384, 768]`):e.id===`depth-anything/Depth-Anything-V2-Large`&&(t=`vitl`,n=`256`,r=`[256, 512, 1024, 1024`),[`
# Install from https://github.com/DepthAnything/Depth-Anything-V2

# Load the model and infer depth from an image
import cv2
import torch

from depth_anything_v2.dpt import DepthAnythingV2

# instantiate the model
model = DepthAnythingV2(encoder="${t}", features=${n}, out_channels=${r})

# load the weights
filepath = hf_hub_download(repo_id="${e.id}", filename="depth_anything_v2_${t}.pth", repo_type="model")
state_dict = torch.load(filepath, map_location="cpu")
model.load_state_dict(state_dict).eval()

raw_img = cv2.imread("your/image/path")
depth = model.infer_image(raw_img) # HxW raw depth map in numpy
    `]},zo=e=>[`# Download checkpoint
pip install huggingface-hub
huggingface-cli download --local-dir checkpoints ${e.id}`,`import depth_pro

# Load model and preprocessing transform
model, transform = depth_pro.create_model_and_transforms()
model.eval()

# Load and preprocess an image.
image, _, f_px = depth_pro.load_rgb("example.png")
image = transform(image)

# Run inference.
prediction = model.infer(image, f_px=f_px)

# Results: 1. Depth in meters
depth = prediction["depth"]
# Results: 2. Focal length in pixels
focallength_px = prediction["focallength_px"]`],Bo=()=>[`from huggingface_hub import from_pretrained_keras
import tensorflow as tf, requests

# Load and format input
IMAGE_URL = "https://storage.googleapis.com/dx-scin-public-data/dataset/images/3445096909671059178.png"
input_tensor = tf.train.Example(
    features=tf.train.Features(
        feature={
            "image/encoded": tf.train.Feature(
                bytes_list=tf.train.BytesList(value=[requests.get(IMAGE_URL, stream=True).content])
            )
        }
    )
).SerializeToString()

# Load model and run inference
loaded_model = from_pretrained_keras("google/derm-foundation")
infer = loaded_model.signatures["serving_default"]
print(infer(inputs=tf.constant([input_tensor])))`],Vo=e=>[`import soundfile as sf
from dia.model import Dia

model = Dia.from_pretrained("${e.id}")
text = "[S1] Dia is an open weights text to dialogue model. [S2] You get full control over scripts and voices. [S1] Wow. Amazing. (laughs) [S2] Try it now on Git hub or Hugging Face."
output = model.generate(text)

sf.write("simple.mp3", output, 44100)`],Ho=e=>[`from dia2 import Dia2, GenerationConfig, SamplingConfig

dia = Dia2.from_repo("${e.id}", device="cuda", dtype="bfloat16")
config = GenerationConfig(
    cfg_scale=2.0,
    audio=SamplingConfig(temperature=0.8, top_k=50),
    use_cuda_graph=True,
)
result = dia.generate("[S1] Hello Dia2!", config=config, output_wav="hello.wav", verbose=True)
`],Uo=e=>[`# pip install git+https://github.com/NVlabs/describe-anything
from huggingface_hub import snapshot_download
from dam import DescribeAnythingModel

snapshot_download(${e.id}, local_dir="checkpoints")

dam = DescribeAnythingModel(
	model_path="checkpoints",
	conv_mode="v1",
	prompt_mode="focal_prompt",
)`],Wo=`pip install -U diffusers transformers accelerate`,Go=`Astronaut in a jungle, cold color palette, muted colors, detailed, 8k`,Ko=`Turn this cat into a dog`,qo=`A man with short gray hair plays a red electric guitar.`,Jo=e=>[`import torch
from diffusers import DiffusionPipeline

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${e.id}", dtype=torch.bfloat16, device_map="cuda")

prompt = "${X(e)??Go}"
image = pipe(prompt).images[0]`],Yo=e=>[`import torch
from diffusers import DiffusionPipeline
from diffusers.utils import load_image

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${e.id}", dtype=torch.bfloat16, device_map="cuda")

prompt = "${X(e)??Ko}"
input_image = load_image("https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png")

image = pipe(image=input_image, prompt=prompt).images[0]`],Xo=e=>[`import torch
from diffusers import DiffusionPipeline
from diffusers.utils import load_image, export_to_video

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${e.id}", dtype=torch.bfloat16, device_map="cuda")
pipe.to("cuda")

prompt = "${X(e)??qo}"
image = load_image(
    "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/guitar-man.png"
)

output = pipe(image=image, prompt=prompt).frames[0]
export_to_video(output, "output.mp4")`],Zo=e=>[`from diffusers import ControlNetModel, StableDiffusionControlNetPipeline

controlnet = ControlNetModel.from_pretrained("${e.id}")
pipe = StableDiffusionControlNetPipeline.from_pretrained(
	"${ko(e)}", controlnet=controlnet
)`],Qo=e=>[`import torch
from diffusers import DiffusionPipeline

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${ko(e)}", dtype=torch.bfloat16, device_map="cuda")
pipe.load_lora_weights("${e.id}")

prompt = "${X(e)??Go}"
image = pipe(prompt).images[0]`],$o=e=>[`import torch
from diffusers import DiffusionPipeline
from diffusers.utils import load_image

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${ko(e)}", dtype=torch.bfloat16, device_map="cuda")
pipe.load_lora_weights("${e.id}")

prompt = "${X(e)??Ko}"
input_image = load_image("https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png")

image = pipe(image=input_image, prompt=prompt).images[0]`],es=e=>[`import torch
from diffusers import DiffusionPipeline
from diffusers.utils import export_to_video

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${ko(e)}", dtype=torch.bfloat16, device_map="cuda")
pipe.load_lora_weights("${e.id}")

prompt = "${X(e)??qo}"

output = pipe(prompt=prompt).frames[0]
export_to_video(output, "output.mp4")`],ts=e=>[`import torch
from diffusers import DiffusionPipeline
from diffusers.utils import load_image, export_to_video

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${ko(e)}", dtype=torch.bfloat16, device_map="cuda")
pipe.load_lora_weights("${e.id}")

prompt = "${X(e)??qo}"
input_image = load_image("https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/guitar-man.png")

image = pipe(image=input_image, prompt=prompt).frames[0]
export_to_video(output, "output.mp4")`],ns=e=>[`import torch
from diffusers import DiffusionPipeline

# switch to "mps" for apple devices
pipe = DiffusionPipeline.from_pretrained("${ko(e)}", dtype=torch.bfloat16, device_map="cuda")
pipe.load_textual_inversion("${e.id}")`],rs=e=>[`import torch
from diffusers import FluxFillPipeline
from diffusers.utils import load_image

image = load_image("https://huggingface.co/datasets/diffusers/diffusers-images-docs/resolve/main/cup.png")
mask = load_image("https://huggingface.co/datasets/diffusers/diffusers-images-docs/resolve/main/cup_mask.png")

# switch to "mps" for apple devices
pipe = FluxFillPipeline.from_pretrained("${e.id}", dtype=torch.bfloat16, device_map="cuda")
image = pipe(
    prompt="a white paper cup",
    image=image,
    mask_image=mask,
    height=1632,
    width=1232,
    guidance_scale=30,
    num_inference_steps=50,
    max_sequence_length=512,
    generator=torch.Generator("cpu").manual_seed(0)
).images[0]
image.save(f"flux-fill-dev.png")`],is=e=>[`import torch
from diffusers import AutoPipelineForInpainting
from diffusers.utils import load_image

# switch to "mps" for apple devices
pipe = AutoPipelineForInpainting.from_pretrained("${e.id}", dtype=torch.float16, variant="fp16", device_map="cuda")

img_url = "https://raw.githubusercontent.com/CompVis/latent-diffusion/main/data/inpainting_examples/overture-creations-5sI6fQgYIuo.png"
mask_url = "https://raw.githubusercontent.com/CompVis/latent-diffusion/main/data/inpainting_examples/overture-creations-5sI6fQgYIuo_mask.png"

image = load_image(img_url).resize((1024, 1024))
mask_image = load_image(mask_url).resize((1024, 1024))

prompt = "a tiger sitting on a park bench"
generator = torch.Generator(device="cuda").manual_seed(0)

image = pipe(
  prompt=prompt,
  image=image,
  mask_image=mask_image,
  guidance_scale=8.0,
  num_inference_steps=20,  # steps between 15 and 30 work well for us
  strength=0.99,  # make sure to use \`strength\` below 1.0
  generator=generator,
).images[0]`],as=e=>{let t;return t=e.tags.includes(`StableDiffusionInpaintPipeline`)||e.tags.includes(`StableDiffusionXLInpaintPipeline`)?is(e):e.tags.includes(`controlnet`)?Zo(e):e.tags.includes(`lora`)?e.pipeline_tag===`image-to-image`?$o(e):e.pipeline_tag===`image-to-video`?ts(e):e.pipeline_tag===`text-to-video`?es(e):Qo(e):e.tags.includes(`textual_inversion`)?ns(e):e.tags.includes(`FluxFillPipeline`)?rs(e):e.pipeline_tag===`image-to-video`?Xo(e):e.pipeline_tag===`image-to-image`?Yo(e):Jo(e),[Wo,...t]},os=e=>{let t=`# Pipeline for Stable Diffusion 3
from diffusionkit.mlx import DiffusionPipeline

pipeline = DiffusionPipeline(
	shift=3.0,
	use_t5=False,
	model_version=${e.id},
	low_memory_mode=True,
	a16=True,
	w16=True,
)`,n=`# Pipeline for Flux
from diffusionkit.mlx import FluxPipeline

pipeline = FluxPipeline(
  shift=1.0,
  model_version=${e.id},
  low_memory_mode=True,
  a16=True,
  w16=True,
)`,r=`# Image Generation
HEIGHT = 512
WIDTH = 512
NUM_STEPS = ${e.tags.includes(`flux`)?4:50}
CFG_WEIGHT = ${e.tags.includes(`flux`)?0:5}

image, _ = pipeline.generate_image(
  "a photo of a cat",
  cfg_weight=CFG_WEIGHT,
  num_steps=NUM_STEPS,
  latent_size=(HEIGHT // 8, WIDTH // 8),
)`;return[e.tags.includes(`flux`)?n:t,r]},ss=e=>[`# pip install --no-binary :all: cartesia-pytorch
from cartesia_pytorch import ReneLMHeadModel
from transformers import AutoTokenizer

model = ReneLMHeadModel.from_pretrained("${e.id}")
tokenizer = AutoTokenizer.from_pretrained("allenai/OLMo-1B-hf")

in_message = ["Rene Descartes was"]
inputs = tokenizer(in_message, return_tensors="pt")

outputs = model.generate(inputs.input_ids, max_length=50, top_k=100, top_p=0.99)
out_message = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]

print(out_message)
)`],cs=e=>[`import mlx.core as mx
import cartesia_mlx as cmx

model = cmx.from_pretrained("${e.id}")
model.set_dtype(mx.float32)

prompt = "Rene Descartes was"

for text in model.generate(
    prompt,
    max_tokens=500,
    eval_every_n=5,
    verbose=True,
    top_p=0.99,
    temperature=0.85,
):
    print(text, end="", flush=True)
`],ls=e=>{let t=Y(e.id).replaceAll(`-`,`_`);return[`# Load it from the Hub directly
import edsnlp
nlp = edsnlp.load("${e.id}")
`,`# Or install it as a package
!pip install git+https://huggingface.co/${e.id}

# and import it as a module
import ${t}

nlp = ${t}.load()  # or edsnlp.load("${t}")
`]},us=e=>[`from espnet2.bin.tts_inference import Text2Speech

model = Text2Speech.from_pretrained("${e.id}")

speech, *_ = model("text to generate speech from")`],ds=e=>[`from espnet2.bin.asr_inference import Speech2Text

model = Speech2Text.from_pretrained(
  "${e.id}"
)

speech, rate = soundfile.read("speech.wav")
text, *_ = model(speech)[0]`],fs=()=>[`unknown model type (must be text-to-speech or automatic-speech-recognition)`],ps=e=>e.tags.includes(`text-to-speech`)?us(e):e.tags.includes(`automatic-speech-recognition`)?ds(e):fs(),ms=e=>[`from fairseq.checkpoint_utils import load_model_ensemble_and_task_from_hf_hub

models, cfg, task = load_model_ensemble_and_task_from_hf_hub(
    "${e.id}"
)`],hs=e=>[`from flair.models import SequenceTagger

tagger = SequenceTagger.load("${e.id}")`],gs=e=>[`from gliner import GLiNER

model = GLiNER.from_pretrained("${e.id}")`],_s=e=>[`from gliner2 import GLiNER2

model = GLiNER2.from_pretrained("${e.id}")

# Extract entities
text = "Apple CEO Tim Cook announced iPhone 15 in Cupertino yesterday."
result = extractor.extract_entities(text, ["company", "person", "product", "location"])

print(result)`],vs=e=>[`# Download model
from huggingface_hub import snapshot_download

snapshot_download(${e.id}, local_dir="checkpoints")

from indextts.infer import IndexTTS

# Ensure config.yaml is present in the checkpoints directory
tts = IndexTTS(model_dir="checkpoints", cfg_path="checkpoints/config.yaml")

voice = "path/to/your/reference_voice.wav"  # Path to the voice reference audio file
text = "Hello, how are you?"
output_path = "output_index.wav"

tts.infer(voice, text, output_path)`],ys=e=>[`# CLI usage
# see docs: https://ai-riksarkivet.github.io/htrflow/latest/getting_started/quick_start.html
htrflow pipeline <path/to/pipeline.yaml> <path/to/image>`,`# Python usage
from htrflow.pipeline.pipeline import Pipeline
from htrflow.pipeline.steps import Task
from htrflow.models.framework.model import ModelClass

pipeline = Pipeline(
    [
        Task(
            ModelClass, {"model": "${e.id}"}, {}
        ),
    ])`],bs=e=>[`# Available backend options are: "jax", "torch", "tensorflow".
import os
os.environ["KERAS_BACKEND"] = "jax"

import keras

model = keras.saving.load_model("hf://${e.id}")
`],xs={CausalLM:e=>`
import keras_hub

# Load CausalLM model (optional: use half precision for inference)
causal_lm = keras_hub.models.CausalLM.from_preset("hf://${e}", dtype="bfloat16")
causal_lm.compile(sampler="greedy")  # (optional) specify a sampler

# Generate text
causal_lm.generate("Keras: deep learning for", max_length=64)
`,TextToImage:e=>`
import keras_hub

# Load TextToImage model (optional: use half precision for inference)
text_to_image = keras_hub.models.TextToImage.from_preset("hf://${e}", dtype="bfloat16")

# Generate images with a TextToImage model.
text_to_image.generate("Astronaut in a jungle")
`,TextClassifier:e=>`
import keras_hub

# Load TextClassifier model
text_classifier = keras_hub.models.TextClassifier.from_preset(
    "hf://${e}",
    num_classes=2,
)
# Fine-tune
text_classifier.fit(x=["Thilling adventure!", "Total snoozefest."], y=[1, 0])
# Classify text
text_classifier.predict(["Not my cup of tea."])
`,ImageClassifier:e=>`
import keras_hub
import keras

# Load ImageClassifier model
image_classifier = keras_hub.models.ImageClassifier.from_preset(
    "hf://${e}",
    num_classes=2,
)
# Fine-tune
image_classifier.fit(
    x=keras.random.randint((32, 64, 64, 3), 0, 256),
    y=keras.random.randint((32, 1), 0, 2),
)
# Classify image
image_classifier.predict(keras.random.randint((1, 64, 64, 3), 0, 256))
`},Ss=(e,t)=>`
import keras_hub

# Create a ${e} model
task = keras_hub.models.${e}.from_preset("hf://${t}")
`,Cs=e=>`
import keras_hub

# Create a Backbone model unspecialized for any task
backbone = keras_hub.models.Backbone.from_preset("hf://${e}")
`,ws=e=>{let t=e.id,n=e.config?.keras_hub?.tasks??[],r=[];for(let[e,i]of Object.entries(xs))n.includes(e)&&r.push(i(t));for(let e of n)Object.keys(xs).includes(e)||r.push(Ss(e,t));return r.push(Cs(t)),r},Ts=e=>[`# !pip install kernels

from kernels import get_kernel

kernel = get_kernel("${e.id}")`],Es=e=>[`# Example usage for KimiAudio
# pip install git+https://github.com/MoonshotAI/Kimi-Audio.git

from kimia_infer.api.kimia import KimiAudio

model = KimiAudio(model_path="${e.id}", load_detokenizer=True)

sampling_params = {
    "audio_temperature": 0.8,
    "audio_top_k": 10,
    "text_temperature": 0.0,
    "text_top_k": 5,
}

# For ASR
asr_audio = "asr_example.wav"
messages_asr = [
    {"role": "user", "message_type": "text", "content": "Please transcribe the following audio:"},
    {"role": "user", "message_type": "audio", "content": asr_audio}
]
_, text = model.generate(messages_asr, **sampling_params, output_type="text")
print(text)

# For Q&A
qa_audio = "qa_example.wav"
messages_conv = [{"role": "user", "message_type": "audio", "content": qa_audio}]
wav, text = model.generate(messages_conv, **sampling_params, output_type="both")
sf.write("output_audio.wav", wav.cpu().view(-1).numpy(), 24000)
print(text)
`],Ds=e=>[`from kittentts import KittenTTS
m = KittenTTS("${e.id}")

audio = m.generate("This high quality TTS model works without a GPU")

# Save the audio
import soundfile as sf
sf.write('output.wav', audio, 24000)`],Os=e=>e.tags.includes(`bi-encoder`)?[`#install from https://github.com/webis-de/lightning-ir

from lightning_ir import BiEncoderModule
model = BiEncoderModule("${e.id}")

model.score("query", ["doc1", "doc2", "doc3"])`]:e.tags.includes(`cross-encoder`)?[`#install from https://github.com/webis-de/lightning-ir

from lightning_ir import CrossEncoderModule
model = CrossEncoderModule("${e.id}")

model.score("query", ["doc1", "doc2", "doc3"])`]:[`#install from https://github.com/webis-de/lightning-ir

from lightning_ir import BiEncoderModule, CrossEncoderModule

# depending on the model type, use either BiEncoderModule or CrossEncoderModule
model = BiEncoderModule("${e.id}")
# model = CrossEncoderModule("${e.id}")

model.score("query", ["doc1", "doc2", "doc3"])`],ks=e=>{let t=[`# !pip install llama-cpp-python

from llama_cpp import Llama

llm = Llama.from_pretrained(
	repo_id="${e.id}",
	filename="{{GGUF_FILE}}",
)
`];if(e.tags.includes(`conversational`)){let n=vo(e);t.push(`llm.create_chat_completion(
	messages = ${yo(n,{attributeKeyQuotes:!0,indent:`	`})}
)`)}else t.push(`output = llm(
	"Once upon a time,",
	max_tokens=512,
	echo=True
)
print(output)`);return t},As=e=>{if(e.tags.includes(`smolvla`)){let t=[`# See https://github.com/huggingface/lerobot?tab=readme-ov-file#installation for more details
git clone https://github.com/huggingface/lerobot.git
cd lerobot
pip install -e .[smolvla]`,`# Launch finetuning on your dataset
python lerobot/scripts/train.py \\
--policy.path=${e.id} \\
--dataset.repo_id=lerobot/svla_so101_pickplace \\
--batch_size=64 \\
--steps=20000 \\
--output_dir=outputs/train/my_smolvla \\
--job_name=my_smolvla_training \\
--policy.device=cuda \\
--wandb.enable=true`];return e.id!==`lerobot/smolvla_base`&&t.push(`# Run the policy using the record function
python -m lerobot.record \\
  --robot.type=so101_follower \\
  --robot.port=/dev/ttyACM0 \\ # <- Use your port
  --robot.id=my_blue_follower_arm \\ # <- Use your robot id
  --robot.cameras="{ front: {type: opencv, index_or_path: 8, width: 640, height: 480, fps: 30}}" \\ # <- Use your cameras
  --dataset.single_task="Grasp a lego block and put it in the bin." \\ # <- Use the same task description you used in your dataset recording
  --dataset.repo_id=HF_USER/dataset_name \\  # <- This will be the dataset name on HF Hub
  --dataset.episode_time_s=50 \\
  --dataset.num_episodes=10 \\
  --policy.path=${e.id}`),t}return[]},js=e=>[`# Note: 'keras<3.x' or 'tf_keras' must be installed (legacy)
# See https://github.com/keras-team/tf-keras for more details.
from huggingface_hub import from_pretrained_keras

model = from_pretrained_keras("${e.id}")
`],Ms=e=>[`from mamba_ssm import MambaLMHeadModel

model = MambaLMHeadModel.from_pretrained("${e.id}")`],Ns=e=>[`# Install from https://github.com/Camb-ai/MARS5-TTS

from inference import Mars5TTS
mars5 = Mars5TTS.from_pretrained("${e.id}")`],Ps=e=>[`# Install from https://github.com/pq-yang/MatAnyone.git

from matanyone.model.matanyone import MatAnyone
model = MatAnyone.from_pretrained("${e.id}")`,`
from matanyone import InferenceCore
processor = InferenceCore("${e.id}")`],Fs=()=>[`# Install from https://github.com/buaacyw/MeshAnything.git

from MeshAnything.models.meshanything import MeshAnything

# refer to https://github.com/buaacyw/MeshAnything/blob/main/main.py#L91 on how to define args
# and https://github.com/buaacyw/MeshAnything/blob/main/app.py regarding usage
model = MeshAnything(args)`],Is=e=>[`import open_clip

model, preprocess_train, preprocess_val = open_clip.create_model_and_transforms('hf-hub:${e.id}')
tokenizer = open_clip.get_tokenizer('hf-hub:${e.id}')`],Ls=e=>{if(e.config?.architectures?.[0]){let t=e.config.architectures[0];return[[`from paddlenlp.transformers import AutoTokenizer, ${t}`,``,`tokenizer = AutoTokenizer.from_pretrained("${e.id}", from_hf_hub=True)`,`model = ${t}.from_pretrained("${e.id}", from_hf_hub=True)`].join(`
`)]}else return[[`# ⚠️ Type of model unknown`,`from paddlenlp.transformers import AutoTokenizer, AutoModel`,``,`tokenizer = AutoTokenizer.from_pretrained("${e.id}", from_hf_hub=True)`,`model = AutoModel.from_pretrained("${e.id}", from_hf_hub=True)`].join(`
`)]},Rs=e=>{let t={textline_detection:{className:`TextDetection`},textline_recognition:{className:`TextRecognition`},seal_text_detection:{className:`SealTextDetection`},doc_img_unwarping:{className:`TextImageUnwarping`},doc_img_orientation_classification:{className:`DocImgOrientationClassification`},textline_orientation_classification:{className:`TextLineOrientationClassification`},chart_parsing:{className:`ChartParsing`},formula_recognition:{className:`FormulaRecognition`},layout_detection:{className:`LayoutDetection`},table_cells_detection:{className:`TableCellsDetection`},wired_table_classification:{className:`TableClassification`},table_structure_recognition:{className:`TableStructureRecognition`}};if(e.tags.includes(`doc_vlm`))return[`# 1. See https://www.paddlepaddle.org.cn/en/install to install paddlepaddle
# 2. pip install paddleocr

from paddleocr import DocVLM
model = DocVLM(model_name="${Y(e.id)}")
output = model.predict(
    input={"image": "path/to/image.png", "query": "Parsing this image and output the content in Markdown format."},
    batch_size=1
)
for res in output:
    res.print()
    res.save_to_json(save_path="./output/res.json")`];if(e.tags.includes(`document-parse`)){let t=e.id.replace(`PaddlePaddle/PaddleOCR-VL-`,`v`);return[`# See https://www.paddleocr.ai/latest/version3.x/pipeline_usage/PaddleOCR-VL.html to installation

from paddleocr import PaddleOCRVL
pipeline = PaddleOCRVL(pipeline_version="${t===`PaddlePaddle/PaddleOCR-VL`?`v1`:t}")
output = pipeline.predict("path/to/document_image.png")
for res in output:
	res.print()
	res.save_to_json(save_path="output")
	res.save_to_markdown(save_path="output")`]}for(let n of e.tags)if(n in t){let{className:r}=t[n];return[`# 1. See https://www.paddlepaddle.org.cn/en/install to install paddlepaddle
# 2. pip install paddleocr

from paddleocr import ${r}
model = ${r}(model_name="${Y(e.id)}")
output = model.predict(input="path/to/image.png", batch_size=1)
for res in output:
    res.print()
    res.save_to_img(save_path="./output/")
    res.save_to_json(save_path="./output/res.json")`]}return[`# Please refer to the document for information on how to use the model.
# https://paddlepaddle.github.io/PaddleOCR/latest/en/version3.x/module_usage/module_overview.html`]},zs=e=>{let t=`# Use PE-Core models as CLIP models
import core.vision_encoder.pe as pe

model = pe.CLIP.from_config("${e.id}", pretrained=True)`,n=`# Use any PE model as a vision encoder
import core.vision_encoder.pe as pe

model = pe.VisionTransformer.from_config("${e.id}", pretrained=True)`;return e.id.includes(`Core`)?[t,n]:[n]},Bs=e=>[`from huggingface_hub import snapshot_download
from phantom_wan import WANI2V, configs

checkpoint_dir = snapshot_download("${e.id}")
wan_i2v = WanI2V(
            config=configs.WAN_CONFIGS['i2v-14B'],
            checkpoint_dir=checkpoint_dir,
        )
 video = wan_i2v.generate(text_prompt, image_prompt)`],Vs=e=>[`from pocket_tts import TTSModel
import scipy.io.wavfile

tts_model = TTSModel.load_model("${e.id}")
voice_state = tts_model.get_state_for_audio_prompt(
    "hf://kyutai/tts-voices/alba-mackenna/casual.wav"
)
audio = tts_model.generate_audio(voice_state, "Hello world, this is a test.")
# Audio is a 1D torch tensor containing PCM data.
scipy.io.wavfile.write("output.wav", tts_model.sample_rate, audio.numpy())`],Hs=e=>[`from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained("${e.id}")

# inference on the whole file
pipeline("file.wav")

# inference on an excerpt
from pyannote.core import Segment
excerpt = Segment(start=2.0, end=5.0)

from pyannote.audio import Audio
waveform, sample_rate = Audio().crop("file.wav", excerpt)
pipeline({"waveform": waveform, "sample_rate": sample_rate})`],Us=e=>[`from pyannote.audio import Model, Inference

model = Model.from_pretrained("${e.id}")
inference = Inference(model)

# inference on the whole file
inference("file.wav")

# inference on an excerpt
from pyannote.core import Segment
excerpt = Segment(start=2.0, end=5.0)
inference.crop("file.wav", excerpt)`],Ws=e=>e.tags.includes(`pyannote-audio-pipeline`)?Hs(e):Us(e),Gs=e=>[`from relik import Relik

relik = Relik.from_pretrained("${e.id}")`],Ks=e=>[`# Install from https://github.com/microsoft/renderformer

from renderformer import RenderFormerRenderingPipeline
pipeline = RenderFormerRenderingPipeline.from_pretrained("${e.id}")`],qs=e=>[`from tensorflow_tts.inference import AutoProcessor, TFAutoModel

processor = AutoProcessor.from_pretrained("${e.id}")
model = TFAutoModel.from_pretrained("${e.id}")
`],Js=e=>[`from tensorflow_tts.inference import TFAutoModel

model = TFAutoModel.from_pretrained("${e.id}")
audios = model.inference(mels)
`],Ys=e=>[`from tensorflow_tts.inference import TFAutoModel

model = TFAutoModel.from_pretrained("${e.id}")
`],Xs=e=>e.tags.includes(`text-to-mel`)?qs(e):e.tags.includes(`mel-to-wav`)?Js(e):Ys(e),Zs=e=>[`import timm

model = timm.create_model("hf_hub:${e.id}", pretrained=True)`],Qs=()=>[`# pip install sae-lens
from sae_lens import SAE

sae, cfg_dict, sparsity = SAE.from_pretrained(
    release = "RELEASE_ID", # e.g., "gpt2-small-res-jb". See other options in https://github.com/jbloomAus/SAELens/blob/main/sae_lens/pretrained_saes.yaml
    sae_id = "SAE_ID", # e.g., "blocks.8.hook_resid_pre". Won't always be a hook point
)`],$s=()=>[`# seed_story_cfg_path refers to 'https://github.com/TencentARC/SEED-Story/blob/master/configs/clm_models/agent_7b_sft.yaml'
# llm_cfg_path refers to 'https://github.com/TencentARC/SEED-Story/blob/master/configs/clm_models/llama2chat7b_lora.yaml'
from omegaconf import OmegaConf
import hydra

# load Llama2
llm_cfg = OmegaConf.load(llm_cfg_path)
llm = hydra.utils.instantiate(llm_cfg, torch_dtype="fp16")

# initialize seed_story
seed_story_cfg = OmegaConf.load(seed_story_cfg_path)
seed_story = hydra.utils.instantiate(seed_story_cfg, llm=llm) `],ec=(e,t)=>[`import joblib
from skops.hub_utils import download
download("${e.id}", "path_to_folder")
model = joblib.load(
	"${t}"
)
# only load pickle files from sources you trust
# read more about it here https://skops.readthedocs.io/en/stable/persistence.html`],tc=(e,t)=>[`from skops.hub_utils import download
from skops.io import load
download("${e.id}", "path_to_folder")
# make sure model file is in skops format
# if model is a pickle file, make sure it's from a source you trust
model = load("path_to_folder/${t}")`],nc=e=>[`from huggingface_hub import hf_hub_download
import joblib
model = joblib.load(
	hf_hub_download("${e.id}", "sklearn_model.joblib")
)
# only load pickle files from sources you trust
# read more about it here https://skops.readthedocs.io/en/stable/persistence.html`],rc=e=>{if(e.tags.includes(`skops`)){let t=e.config?.sklearn?.model?.file,n=e.config?.sklearn?.model_format;return t?n===`pickle`?ec(e,t):tc(e,t):[`# ⚠️ Model filename not specified in config.json`]}else return nc(e)},ic=e=>[`import torch
import torchaudio
from einops import rearrange
from stable_audio_tools import get_pretrained_model
from stable_audio_tools.inference.generation import generate_diffusion_cond

device = "cuda" if torch.cuda.is_available() else "cpu"

# Download model
model, model_config = get_pretrained_model("${e.id}")
sample_rate = model_config["sample_rate"]
sample_size = model_config["sample_size"]

model = model.to(device)

# Set up text and timing conditioning
conditioning = [{
	"prompt": "128 BPM tech house drum loop",
}]

# Generate stereo audio
output = generate_diffusion_cond(
	model,
	conditioning=conditioning,
	sample_size=sample_size,
	device=device
)

# Rearrange audio batch to a single sequence
output = rearrange(output, "b d n -> d (b n)")

# Peak normalize, clip, convert to int16, and save to file
output = output.to(torch.float32).div(torch.max(torch.abs(output))).clamp(-1, 1).mul(32767).to(torch.int16).cpu()
torchaudio.save("output.wav", output, sample_rate)`],ac=e=>[`from huggingface_hub import from_pretrained_fastai

learn = from_pretrained_fastai("${e.id}")`],oc=e=>[`# Use SAM2 with images
import torch
from sam2.sam2_image_predictor import SAM2ImagePredictor

predictor = SAM2ImagePredictor.from_pretrained(${e.id})

with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
    predictor.set_image(<your_image>)
    masks, _, _ = predictor.predict(<input_prompts>)`,`# Use SAM2 with videos
import torch
from sam2.sam2_video_predictor import SAM2VideoPredictor

predictor = SAM2VideoPredictor.from_pretrained(${e.id})

with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):
    state = predictor.init_state(<your_video>)

    # add new prompts and instantly get the output on the same frame
    frame_idx, object_ids, masks = predictor.add_new_points(state, <your_prompts>):

    # propagate the prompts to get masklets throughout the video
    for frame_idx, object_ids, masks in predictor.propagate_in_video(state):
        ...`],sc=e=>[`from inference import Inference, load_image, load_single_mask
from huggingface_hub import hf_hub_download

path = hf_hub_download("${e.id}", "pipeline.yaml")
inference = Inference(path, compile=False)

image = load_image("path_to_image.png")
mask = load_single_mask("path_to_mask.png", index=14)

output = inference(image, mask)`],cc=e=>[`from notebook.utils import setup_sam_3d_body

estimator = setup_sam_3d_body(${e.id})
outputs = estimator.process_one_image(image)
rend_img = visualize_sample_together(image, outputs, estimator.faces)`],lc=e=>[`python -m sample_factory.huggingface.load_from_hub -r ${e.id} -d ./train_dir`];function uc(e){let t=e.widgetData?.[0];if(t?.source_sentence&&t?.sentences?.length)return[t.source_sentence,...t.sentences]}var dc=e=>{let t=e.tags.includes(bo)?`, trust_remote_code=True`:``;if(e.tags.includes(`PyLate`))return[`from pylate import models

queries = [
    "Which planet is known as the Red Planet?",
    "What is the largest planet in our solar system?",
]

documents = [
    ["Mars is the Red Planet.", "Venus is Earth's twin."],
    ["Jupiter is the largest planet.", "Saturn has rings."],
]

model = models.ColBERT(model_name_or_path="${e.id}")

queries_emb = model.encode(queries, is_query=True)
docs_emb = model.encode(documents, is_query=False)`];if(e.tags.includes(`cross-encoder`)||e.pipeline_tag==`text-ranking`)return[`from sentence_transformers import CrossEncoder

model = CrossEncoder("${e.id}"${t})

query = "Which planet is known as the Red Planet?"
passages = [
	"Venus is often called Earth's twin because of its similar size and proximity.",
	"Mars, known for its reddish appearance, is often referred to as the Red Planet.",
	"Jupiter, the largest planet in our solar system, has a prominent red spot.",
	"Saturn, famous for its rings, is sometimes mistaken for the Red Planet."
]

scores = model.predict([(query, passage) for passage in passages])
print(scores)`];let n=uc(e)??[`The weather is lovely today.`,`It's so sunny outside!`,`He drove to the stadium.`];return[`from sentence_transformers import SentenceTransformer

model = SentenceTransformer("${e.id}"${t})

sentences = ${JSON.stringify(n,null,4)}
embeddings = model.encode(sentences)

similarities = model.similarity(embeddings, embeddings)
print(similarities.shape)
# [${n.length}, ${n.length}]`]},fc=e=>[`from setfit import SetFitModel

model = SetFitModel.from_pretrained("${e.id}")`],pc=e=>[`!pip install https://huggingface.co/${e.id}/resolve/main/${Y(e.id)}-any-py3-none-any.whl

# Using spacy.load().
import spacy
nlp = spacy.load("${Y(e.id)}")

# Importing as module.
import ${Y(e.id)}
nlp = ${Y(e.id)}.load()`],mc=e=>[`from span_marker import SpanMarkerModel

model = SpanMarkerModel.from_pretrained("${e.id}")`],hc=e=>[`import stanza

stanza.download("${Y(e.id).replace(`stanza-`,``)}")
nlp = stanza.Pipeline("${Y(e.id).replace(`stanza-`,``)}")`],gc=e=>{switch(e){case`EncoderClassifier`:return`classify_file`;case`EncoderDecoderASR`:case`EncoderASR`:return`transcribe_file`;case`SpectralMaskEnhancement`:return`enhance_file`;case`SepformerSeparation`:return`separate_file`;default:return}},_c=e=>{let t=e.config?.speechbrain?.speechbrain_interface;if(t===void 0)return[`# interface not specified in config.json`];let n=gc(t);return n===void 0?[`# interface in config.json invalid`]:[`from speechbrain.pretrained import ${t}
model = ${t}.from_hparams(
  "${e.id}"
)
model.${n}("file.wav")`]},vc=e=>[`from terratorch.registry import BACKBONE_REGISTRY

model = BACKBONE_REGISTRY.build("${e.id}")`],yc=e=>e.config?.tokenizer_config?.chat_template!==void 0||e.config?.processor_config?.chat_template!==void 0||e.config?.chat_template_jinja!==void 0,bc=e=>{let t=e.transformersInfo;if(!t)return[`# ⚠️ Type of model unknown`];let n=e.tags.includes(bo)?`, trust_remote_code=True`:``,r=[];if(t.processor){let i=t.processor===`AutoTokenizer`?`tokenizer`:t.processor===`AutoFeatureExtractor`?`extractor`:`processor`;r.push(`# Load model directly`,`from transformers import ${t.processor}, ${t.auto_model}`,``,`${i} = ${t.processor}.from_pretrained("${e.id}"`+n+`)`,`model = ${t.auto_model}.from_pretrained("${e.id}"`+n+`)`),e.tags.includes(`conversational`)&&yc(e)&&(e.tags.includes(`image-text-to-text`)?r.push(`messages = [`,[`    {`,`        "role": "user",`,`        "content": [`,`            {"type": "image", "url": "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/p-blog/candy.JPG"},`,`            {"type": "text", "text": "What animal is on the candy?"}`,`        ]`,`    },`].join(`
`),`]`):r.push(`messages = [`,`    {"role": "user", "content": "Who are you?"},`,`]`),r.push(`inputs = ${i}.apply_chat_template(`,`	messages,`,`	add_generation_prompt=True,`,`	tokenize=True,`,`	return_dict=True,`,`	return_tensors="pt",`,`).to(model.device)`,``,`outputs = model.generate(**inputs, max_new_tokens=40)`,`print(${i}.decode(outputs[0][inputs["input_ids"].shape[-1]:]))`))}else r.push(`# Load model directly`,`from transformers import ${t.auto_model}`,`model = ${t.auto_model}.from_pretrained("${e.id}"`+n+`, dtype="auto")`);if(e.pipeline_tag&&Ui.transformers?.includes(e.pipeline_tag)){let t=[`# Use a pipeline as a high-level helper`];return Wi.includes(e.pipeline_tag)&&t.push(`# Warning: Pipeline type "${e.pipeline_tag}" is no longer supported in transformers v5.`,`# You must load the model directly (see below) or downgrade to v4.x with:`,`# 'pip install "transformers<5.0.0'`),t.push(`from transformers import pipeline`,``,`pipe = pipeline("${e.pipeline_tag}", model="${e.id}"`+n+`)`),e.tags.includes(`conversational`)?e.tags.includes(`image-text-to-text`)?(t.push(`messages = [`,[`    {`,`        "role": "user",`,`        "content": [`,`            {"type": "image", "url": "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/p-blog/candy.JPG"},`,`            {"type": "text", "text": "What animal is on the candy?"}`,`        ]`,`    },`].join(`
`),`]`),t.push(`pipe(text=messages)`)):(t.push(`messages = [`,`    {"role": "user", "content": "Who are you?"},`,`]`),t.push(`pipe(messages)`)):e.pipeline_tag===`zero-shot-image-classification`?t.push(`pipe(`,`    "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/hub/parrots.png",`,`    candidate_labels=["animals", "humans", "landscape"],`,`)`):e.pipeline_tag===`image-classification`&&t.push(`pipe("https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/hub/parrots.png")`),[t.join(`
`),r.join(`
`)]}return[r.join(`
`)]},xc=e=>{if(!e.pipeline_tag)return[`// ⚠️ Unknown pipeline tag`];let t=`@huggingface/transformers`;return[`// npm i ${t}
import { pipeline } from '${t}';

// Allocate pipeline
const pipe = await pipeline('${e.pipeline_tag}', '${e.id}');`]},Sc=e=>{switch(e){case`CAUSAL_LM`:return`CausalLM`;case`SEQ_2_SEQ_LM`:return`Seq2SeqLM`;case`TOKEN_CLS`:return`TokenClassification`;case`SEQ_CLS`:return`SequenceClassification`;default:return}},Cc=e=>{let{base_model_name_or_path:t,task_type:n}=e.config?.peft??{},r=Sc(n);return r?t?[`from peft import PeftModel
from transformers import AutoModelFor${r}

base_model = AutoModelFor${r}.from_pretrained("${t}")
model = PeftModel.from_pretrained(base_model, "${e.id}")`]:[`Base model is not found.`]:[`Task type is invalid.`]},wc=e=>[`from huggingface_hub import hf_hub_download
import fasttext

model = fasttext.load_model(hf_hub_download("${e.id}", "model.bin"))`],Tc=e=>[`from huggingface_sb3 import load_from_hub
checkpoint = load_from_hub(
	repo_id="${e.id}",
	filename="{MODEL FILENAME}.zip",
)`],Ec=(e,t)=>{switch(e){case`ASR`:return[`import nemo.collections.asr as nemo_asr
asr_model = nemo_asr.models.ASRModel.from_pretrained("${t.id}")

transcriptions = asr_model.transcribe(["file.wav"])`];default:return}},Dc=e=>[`mlagents-load-from-hf --repo-id="${e.id}" --local-dir="./download: string[]s"`],Oc=()=>[`string modelName = "[Your model name here].sentis";
Model model = ModelLoader.Load(Application.streamingAssetsPath + "/" + modelName);
IWorker engine = WorkerFactory.CreateWorker(BackendType.GPUCompute, model);
// Please see provided C# file for more details
`],kc=e=>[`
# Load the model and infer image from text
import torch
from app.sana_pipeline import SanaPipeline
from torchvision.utils import save_image

sana = SanaPipeline("configs/sana_config/1024ms/Sana_1600M_img1024.yaml")
sana.from_pretrained("hf://${e.id}")

image = sana(
    prompt='a cyberpunk cat with a neon sign that says "Sana"',
    height=1024,
    width=1024,
    guidance_scale=5.0,
    pag_guidance_scale=2.0,
    num_inference_steps=18,
) `],Ac=e=>[`import torch, soundfile as sf, librosa, numpy as np
from vibevoice.processor.vibevoice_processor import VibeVoiceProcessor
from vibevoice.modular.modeling_vibevoice_inference import VibeVoiceForConditionalGenerationInference

# Load voice sample (should be 24kHz mono)
voice, sr = sf.read("path/to/voice_sample.wav")
if voice.ndim > 1: voice = voice.mean(axis=1)
if sr != 24000: voice = librosa.resample(voice, sr, 24000)

processor = VibeVoiceProcessor.from_pretrained("${e.id}")
model = VibeVoiceForConditionalGenerationInference.from_pretrained(
    "${e.id}", torch_dtype=torch.bfloat16
).to("cuda").eval()
model.set_ddpm_inference_steps(5)

inputs = processor(text=["Speaker 0: Hello!\\nSpeaker 1: Hi there!"],
                   voice_samples=[[voice]], return_tensors="pt")
audio = model.generate(**inputs, cfg_scale=1.3,
                       tokenizer=processor.tokenizer).speech_outputs[0]
sf.write("output.wav", audio.cpu().numpy().squeeze(), 24000)`],jc=e=>[`# Install from https://github.com/google-deepmind/videoprism
import jax
from videoprism import models as vp

flax_model = vp.get_model("${e.id}")
loaded_state = vp.load_pretrained_weights("${e.id}")

@jax.jit
def forward_fn(inputs, train=False):
  return flax_model.apply(loaded_state, inputs, train=train)`],Mc=e=>[`from Trainer_finetune import Model

model = Model.from_pretrained("${e.id}")`],Nc=e=>[`from huggingface_hub import hf_hub_download
	 from inference_onnx import LVFaceONNXInferencer

model_path = hf_hub_download("${e.id}", "LVFace-L_Glint360K/LVFace-L_Glint360K.onnx")
inferencer = LVFaceONNXInferencer(model_path, use_gpu=True, timeout=300)
img_path = 'path/to/image1.jpg'
embedding = inferencer.infer_from_image(img_path)`],Pc=e=>[`from voicecraft import VoiceCraft

model = VoiceCraft.from_pretrained("${e.id}")`],Fc=e=>[`import soundfile as sf
from voxcpm import VoxCPM

model = VoxCPM.from_pretrained("${e.id}")

wav = model.generate(
    text="VoxCPM is an innovative end-to-end TTS model from ModelBest, designed to generate highly expressive speech.",
    prompt_wav_path=None,      # optional: path to a prompt speech for voice cloning
    prompt_text=None,          # optional: reference text
    cfg_value=2.0,             # LM guidance on LocDiT, higher for better adherence to the prompt, but maybe worse
    inference_timesteps=10,   # LocDiT inference timesteps, higher for better result, lower for fast speed
    normalize=True,           # enable external TN tool
    denoise=True,             # enable external Denoise tool
    retry_badcase=True,        # enable retrying mode for some bad cases (unstoppable)
    retry_badcase_max_times=3,  # maximum retrying times
    retry_badcase_ratio_threshold=6.0, # maximum length restriction for bad case detection (simple but effective), it could be adjusted for slow pace speech
)

sf.write("output.wav", wav, 16000)
print("saved: output.wav")`],Ic=()=>[`# !pip install git+https://github.com/fluxions-ai/vui

import torchaudio

from vui.inference import render
from vui.model import Vui,

model = Vui.from_pretrained().cuda()
waveform = render(
    model,
    "Hey, here is some random stuff, usually something quite long as the shorter the text the less likely the model can cope!",
)
print(waveform.shape)
torchaudio.save("out.opus", waveform[0], 22050)
`],Lc=()=>[`import ChatTTS
import torchaudio

chat = ChatTTS.Chat()
chat.load_models(compile=False) # Set to True for better performance

texts = ["PUT YOUR TEXT HERE",]

wavs = chat.infer(texts, )

torchaudio.save("output1.wav", torch.from_numpy(wavs[0]), 24000)`],Rc=e=>{let t=e.tags.find(e=>e.match(/^yolov\d+$/)),n=t?`YOLOv${t.slice(4)}`:`YOLOvXX`;return[(t?``:`# Couldn't find a valid YOLO version tag.
# Replace XX with the correct version.
`)+`from ultralytics import ${n}

model = ${n}.from_pretrained("${e.id}")
source = 'http://images.cocodataset.org/val2017/000000039769.jpg'
model.predict(source=source, save=True)`]},zc=e=>[`# Option 1: use with transformers

from transformers import AutoModelForImageSegmentation
birefnet = AutoModelForImageSegmentation.from_pretrained("${e.id}", trust_remote_code=True)
`,`# Option 2: use with BiRefNet

# Install from https://github.com/ZhengPeng7/BiRefNet

from models.birefnet import BiRefNet
model = BiRefNet.from_pretrained("${e.id}")`],Bc=()=>[`from supertonic import TTS

tts = TTS(auto_download=True)

style = tts.get_voice_style(voice_name="M1")

text = "The train delay was announced at 4:45 PM on Wed, Apr 3, 2024 due to track maintenance."
wav, duration = tts.synthesize(text, voice_style=style)

tts.save_audio(wav, "output.wav")`],Vc=e=>[`from swarmformer import SwarmFormerModel

model = SwarmFormerModel.from_pretrained("${e.id}")
`],Hc=e=>[`# Follow installation instructions at https://github.com/PKU-YuanGroup/UniWorld-V1

from univa.models.qwen2p5vl.modeling_univa_qwen2p5vl import UnivaQwen2p5VLForConditionalGeneration
	model = UnivaQwen2p5VLForConditionalGeneration.from_pretrained(
        "${e.id}",
        torch_dtype=torch.bfloat16,
        attn_implementation="flash_attention_2",
    ).to("cuda")
	processor = AutoProcessor.from_pretrained("${e.id}")
`],Uc=e=>[`# Download the model from the Hub
pip install huggingface_hub[hf_xet]

huggingface-cli download --local-dir ${Y(e.id)} ${e.id}`],Wc=e=>[`# Make sure mlx-lm is installed
# pip install --upgrade mlx-lm
# if on a CUDA device, also pip install mlx[cuda]

# Generate text with mlx-lm
from mlx_lm import load, generate

model, tokenizer = load("${e.id}")

prompt = "Once upon a time in"
text = generate(model, tokenizer, prompt=prompt, verbose=True)`],Gc=e=>[`# Make sure mlx-lm is installed
# pip install --upgrade mlx-lm

# Generate text with mlx-lm
from mlx_lm import load, generate

model, tokenizer = load("${e.id}")

prompt = "Write a story about Einstein"
messages = [{"role": "user", "content": prompt}]
prompt = tokenizer.apply_chat_template(
    messages, add_generation_prompt=True
)

text = generate(model, tokenizer, prompt=prompt, verbose=True)`],Kc=e=>[`# Make sure mlx-vlm is installed
# pip install --upgrade mlx-vlm

from mlx_vlm import load, generate
from mlx_vlm.prompt_utils import apply_chat_template
from mlx_vlm.utils import load_config

# Load the model
model, processor = load("${e.id}")
config = load_config("${e.id}")

# Prepare input
image = ["http://images.cocodataset.org/val2017/000000039769.jpg"]
prompt = "Describe this image."

# Apply chat template
formatted_prompt = apply_chat_template(
    processor, config, prompt, num_images=1
)

# Generate output
output = generate(model, processor, formatted_prompt, image)
print(output)`],qc=e=>[`from mlxim.model import create_model

model = create_model(${e.id})`],Jc=e=>e.pipeline_tag===`image-text-to-text`?Kc(e):e.pipeline_tag===`text-generation`?e.tags.includes(`conversational`)?Gc(e):Wc(e):Uc(e),Yc=e=>[`from model2vec import StaticModel

model = StaticModel.from_pretrained("${e.id}")`],Xc=e=>{let t;return t=e.tags.includes(`diffusers`)?Zc(e):e.tags.includes(`transformers`)?Qc(e):$c(e),t=t.map(e=>/^from pruna import PrunaModel/m.test(e)?e:`from pruna import PrunaModel\n${e}`),e.tags.includes(`pruna_pro-ai`)?t.map(e=>e.replace(/\bpruna\b/g,`pruna_pro`).replace(/\bPrunaModel\b/g,`PrunaProModel`)):t},Zc=e=>as(e).map(e=>e.replace(/\b\w*Pipeline\w*\b/g,`PrunaModel`).replace(/from diffusers import ([^,\n]*PrunaModel[^,\n]*)/g,``).replace(/from diffusers import ([^,\n]+),?\s*([^,\n]*PrunaModel[^,\n]*)/g,`from diffusers import $1`).replace(/from diffusers import\s*(\n|$)/g,``).replace(/from diffusers import PrunaModel/g,`from pruna import PrunaModel`).replace(/from diffusers import ([^,\n]+), PrunaModel/g,`from diffusers import $1`).replace(/from diffusers import PrunaModel, ([^,\n]+)/g,`from diffusers import $1`).replace(/\n\n+/g,`
`).trim()),Qc=e=>{let t=e.transformersInfo,n=bc(e).map(t=>t.replace(/from transformers import pipeline/g,`from pruna import PrunaModel`).replace(/pipeline\([^)]*\)/g,`PrunaModel.from_pretrained("${e.id}")`));return t?.auto_model&&(n=n.map(e=>e.replace(RegExp(`from transformers import ${t.auto_model}\n?`,`g`),``).replace(RegExp(`${t.auto_model}.from_pretrained`,`g`),`PrunaModel.from_pretrained`).replace(RegExp(`^.*from.*import.*(, *${t.auto_model})+.*$`,`gm`),e=>e.replace(RegExp(`, *${t.auto_model}`,`g`),``)))),n},$c=e=>[`from pruna import PrunaModel
model = PrunaModel.from_pretrained("${e.id}")
`],el=e=>{let t;return e.tags.includes(`automatic-speech-recognition`)&&(t=Ec(`ASR`,e)),t??[`# tag did not correspond to a valid NeMo domain.`]},tl=e=>{let t=e.tags??[];return t.includes(`gguf`)||t.includes(`onnx`)?[]:[`
  import outetts

  enum = outetts.Models("${e.id}".split("/", 1)[1])       # VERSION_1_0_SIZE_1B
  cfg  = outetts.ModelConfig.auto_config(enum, outetts.Backend.HF)
  tts  = outetts.Interface(cfg)

  speaker = tts.load_default_speaker("EN-FEMALE-1-NEUTRAL")
  tts.generate(
	  outetts.GenerationConfig(
		  text="Hello there, how are you doing?",
		  speaker=speaker,
	  )
  ).save("output.wav")
  `]},nl=e=>[`from pxia import AutoModel

model = AutoModel.from_pretrained("${e.id}")`],rl=e=>[`from pythae.models import AutoModel

model = AutoModel.load_from_hf_hub("${e.id}")`],il=e=>[`# pip install qwen-tts
import torch
import soundfile as sf
from qwen_tts import Qwen3TTSModel

model = Qwen3TTSModel.from_pretrained(
    "${e.id}",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="flash_attention_2",
)

wavs, sr = model.generate_custom_voice(
    text="Your text here.",
    language="English",
    speaker="Ryan",
    instruct="Speak in a natural tone.",
)

sf.write("output.wav", wavs[0], sr)`],al=e=>[`from audiocraft.models import MusicGen

model = MusicGen.get_pretrained("${e.id}")

descriptions = ['happy rock', 'energetic EDM', 'sad jazz']
wav = model.generate(descriptions)  # generates 3 samples.`],ol=e=>[`from audiocraft.models import MAGNeT

model = MAGNeT.get_pretrained("${e.id}")

descriptions = ['disco beat', 'energetic EDM', 'funky groove']
wav = model.generate(descriptions)  # generates 3 samples.`],sl=e=>[`from audiocraft.models import AudioGen

model = AudioGen.get_pretrained("${e.id}")
model.set_generation_params(duration=5)  # generate 5 seconds.
descriptions = ['dog barking', 'sirene of an emergency vehicle', 'footsteps in a corridor']
wav = model.generate(descriptions)  # generates 3 samples.`];Object.entries({acestep:{prettyLabel:`ACE-Step`,repoName:`ACE-Step`,repoUrl:`https://github.com/ace-step/ACE-Step`,filter:!1,countDownloads:`path:"ace_step_transformer/config.json"`},"adapter-transformers":{prettyLabel:`Adapters`,repoName:`adapters`,repoUrl:`https://github.com/Adapter-Hub/adapters`,docsUrl:`https://huggingface.co/docs/hub/adapters`,snippets:So,filter:!0,countDownloads:`path:"adapter_config.json"`},allennlp:{prettyLabel:`AllenNLP`,repoName:`AllenNLP`,repoUrl:`https://github.com/allenai/allennlp`,docsUrl:`https://huggingface.co/docs/hub/allennlp`,snippets:To,filter:!0},anemoi:{prettyLabel:`AnemoI`,repoName:`AnemoI`,repoUrl:`https://github.com/ecmwf/anemoi-inference`,docsUrl:`https://anemoi.readthedocs.io/en/latest/`,filter:!1,countDownloads:`path_extension:"ckpt"`,snippets:e=>[`from anemoi.inference.runners.default import DefaultRunner
from anemoi.inference.config.run import RunConfiguration
# Create Configuration
config = RunConfiguration(checkpoint = {"huggingface":"${e.id}"})
# Load Runner
runner = DefaultRunner(config)`]},araclip:{prettyLabel:`AraClip`,repoName:`AraClip`,repoUrl:`https://huggingface.co/Arabic-Clip/araclip`,filter:!1,snippets:Eo},"aviation-ner":{prettyLabel:`Aviation NER`,repoName:`Aviation NER`,repoUrl:`https://github.com/Boeing/aviation_ner_sdr`,docsUrl:`https://github.com/Boeing/aviation_ner_sdr`,countDownloads:`path:"gliner_config.json"`,filter:!1},asteroid:{prettyLabel:`Asteroid`,repoName:`Asteroid`,repoUrl:`https://github.com/asteroid-team/asteroid`,docsUrl:`https://huggingface.co/docs/hub/asteroid`,snippets:Do,filter:!0,countDownloads:`path:"pytorch_model.bin"`},audiocraft:{prettyLabel:`Audiocraft`,repoName:`audiocraft`,repoUrl:`https://github.com/facebookresearch/audiocraft`,snippets:e=>e.tags.includes(`musicgen`)?al(e):e.tags.includes(`audiogen`)?sl(e):e.tags.includes(`magnet`)?ol(e):[`# Type of model unknown.`],filter:!1,countDownloads:`path:"state_dict.bin"`},audioseal:{prettyLabel:`AudioSeal`,repoName:`audioseal`,repoUrl:`https://github.com/facebookresearch/audioseal`,filter:!1,countDownloads:`path_extension:"pth"`,snippets:Oo},"bagel-mot":{prettyLabel:`Bagel`,repoName:`Bagel`,repoUrl:`https://github.com/ByteDance-Seed/Bagel/`,filter:!1,countDownloads:`path:"llm_config.json"`},bboxmaskpose:{prettyLabel:`BBoxMaskPose`,repoName:`BBoxMaskPose`,repoUrl:`https://github.com/MiraPurkrabek/BBoxMaskPose`,filter:!1,countDownloads:`path_extension:"pth"`},ben2:{prettyLabel:`BEN2`,repoName:`BEN2`,repoUrl:`https://github.com/PramaLLC/BEN2`,snippets:Ao,filter:!1},bertopic:{prettyLabel:`BERTopic`,repoName:`BERTopic`,repoUrl:`https://github.com/MaartenGr/BERTopic`,snippets:jo,filter:!0},big_vision:{prettyLabel:`Big Vision`,repoName:`big_vision`,repoUrl:`https://github.com/google-research/big_vision`,filter:!1,countDownloads:`path_extension:"npz"`},birder:{prettyLabel:`Birder`,repoName:`Birder`,repoUrl:`https://gitlab.com/birder/birder`,filter:!1,countDownloads:`path_extension:"pt"`},birefnet:{prettyLabel:`BiRefNet`,repoName:`BiRefNet`,repoUrl:`https://github.com/ZhengPeng7/BiRefNet`,snippets:zc,filter:!1},bm25s:{prettyLabel:`BM25S`,repoName:`bm25s`,repoUrl:`https://github.com/xhluca/bm25s`,snippets:Mo,filter:!1,countDownloads:`path:"params.index.json"`},boltzgen:{prettyLabel:`BoltzGen`,repoName:`BoltzGen`,repoUrl:`https://github.com/HannesStark/boltzgen`,filter:!1,countDownloads:`path:"boltzgen1_diverse.ckpt"`},cancertathomev2:{prettyLabel:`Cancer@HomeV2`,repoName:`Cancer@HomeV2`,repoUrl:`https://huggingface.co/OpenPeerAI/CancerAtHomeV2`,filter:!1,countDownloads:`path:"run.py"`},cartesia_pytorch:{prettyLabel:`Cartesia Pytorch`,repoName:`Cartesia Pytorch`,repoUrl:`https://github.com/cartesia-ai/cartesia_pytorch`,snippets:ss},cartesia_mlx:{prettyLabel:`Cartesia MLX`,repoName:`Cartesia MLX`,repoUrl:`https://github.com/cartesia-ai/cartesia_mlx`,snippets:cs},champ:{prettyLabel:`Champ`,repoName:`Champ`,repoUrl:`https://github.com/fudan-generative-vision/champ`,countDownloads:`path:"champ/motion_module.pth"`},chatterbox:{prettyLabel:`Chatterbox`,repoName:`Chatterbox`,repoUrl:`https://github.com/resemble-ai/chatterbox`,snippets:No,countDownloads:`path:"tokenizer.json"`,filter:!1},chaossim:{prettyLabel:`ChaosSIM`,repoName:`ChaosSIM`,repoUrl:`https://huggingface.co/OpenPeerAI/ChaosSIM/`,countDownloads:`path:"ChaosSim.nb"`,filter:!1},chat_tts:{prettyLabel:`ChatTTS`,repoName:`ChatTTS`,repoUrl:`https://github.com/2noise/ChatTTS.git`,snippets:Lc,filter:!1,countDownloads:`path:"asset/GPT.pt"`},"chronos-forecasting":{prettyLabel:`Chronos`,repoName:`Chronos`,repoUrl:`https://github.com/amazon-science/chronos-forecasting`,snippets:Po},clara:{prettyLabel:`Clara`,repoName:`Clara`,filter:!1,repoUrl:`https://github.com/nvidia/clara`,countDownloads:`path_extension:"ckpt" OR path:"config.json"`},clipscope:{prettyLabel:`clipscope`,repoName:`clipscope`,repoUrl:`https://github.com/Lewington-pitsos/clipscope`,filter:!1,countDownloads:`path_extension:"pt"`},"cloud-agents":{prettyLabel:`Cloud Agents`,repoName:`Cloud Agents`,repoUrl:`https://huggingface.co/OpenPeerAI/Cloud-Agents`,filter:!1,countDownloads:`path:"setup.py"`},colipri:{prettyLabel:`COLIPRI`,repoName:`COLIPRI`,repoUrl:`https://huggingface.co/microsoft/colipri`,snippets:Fo,filter:!1,countDownloads:`path_extension:"safetensors"`},cosyvoice:{prettyLabel:`CosyVoice`,repoName:`CosyVoice`,repoUrl:`https://github.com/FunAudioLLM/CosyVoice`,filter:!1,countDownloads:`path_extension:"onnx" OR path_extension:"pt"`},cotracker:{prettyLabel:`CoTracker`,repoName:`CoTracker`,repoUrl:`https://github.com/facebookresearch/co-tracker`,filter:!1,countDownloads:`path_extension:"pth"`},colpali:{prettyLabel:`ColPali`,repoName:`ColPali`,repoUrl:`https://github.com/ManuelFay/colpali`,filter:!1,countDownloads:`path:"adapter_config.json"`},comet:{prettyLabel:`COMET`,repoName:`COMET`,repoUrl:`https://github.com/Unbabel/COMET/`,countDownloads:`path:"hparams.yaml"`},cosmos:{prettyLabel:`Cosmos`,repoName:`Cosmos`,repoUrl:`https://github.com/NVIDIA/Cosmos`,countDownloads:`path:"config.json" OR path_extension:"pt"`},"cxr-foundation":{prettyLabel:`CXR Foundation`,repoName:`cxr-foundation`,repoUrl:`https://github.com/google-health/cxr-foundation`,snippets:Lo,filter:!1,countDownloads:`path:"precomputed_embeddings/embeddings.npz" OR path:"pax-elixr-b-text/saved_model.pb"`},deepforest:{prettyLabel:`DeepForest`,repoName:`deepforest`,docsUrl:`https://deepforest.readthedocs.io/en/latest/`,repoUrl:`https://github.com/weecology/DeepForest`},"depth-anything-v2":{prettyLabel:`DepthAnythingV2`,repoName:`Depth Anything V2`,repoUrl:`https://github.com/DepthAnything/Depth-Anything-V2`,snippets:Ro,filter:!1,countDownloads:`path_extension:"pth"`},"depth-pro":{prettyLabel:`Depth Pro`,repoName:`Depth Pro`,repoUrl:`https://github.com/apple/ml-depth-pro`,countDownloads:`path_extension:"pt"`,snippets:zo,filter:!1},"derm-foundation":{prettyLabel:`Derm Foundation`,repoName:`derm-foundation`,repoUrl:`https://github.com/google-health/derm-foundation`,snippets:Bo,filter:!1,countDownloads:`path:"scin_dataset_precomputed_embeddings.npz" OR path:"saved_model.pb"`},"describe-anything":{prettyLabel:`Describe Anything`,repoName:`Describe Anything`,repoUrl:`https://github.com/NVlabs/describe-anything`,snippets:Uo,filter:!1},"dia-tts":{prettyLabel:`Dia`,repoName:`Dia`,repoUrl:`https://github.com/nari-labs/dia`,snippets:Vo,filter:!1},dia2:{prettyLabel:`Dia2`,repoName:`Dia2`,repoUrl:`https://github.com/nari-labs/dia2`,snippets:Ho,filter:!1},"diff-interpretation-tuning":{prettyLabel:`Diff Interpretation Tuning`,repoName:`Diff Interpretation Tuning`,repoUrl:`https://github.com/Aviously/diff-interpretation-tuning`,filter:!1,countDownloads:`path_extension:"pt"`},diffree:{prettyLabel:`Diffree`,repoName:`Diffree`,repoUrl:`https://github.com/OpenGVLab/Diffree`,filter:!1,countDownloads:`path:"diffree-step=000010999.ckpt"`},diffusers:{prettyLabel:`Diffusers`,repoName:`🤗/diffusers`,repoUrl:`https://github.com/huggingface/diffusers`,docsUrl:`https://huggingface.co/docs/hub/diffusers`,snippets:as,filter:!0},diffusionkit:{prettyLabel:`DiffusionKit`,repoName:`DiffusionKit`,repoUrl:`https://github.com/argmaxinc/DiffusionKit`,snippets:os},"docking-at-home":{prettyLabel:`Docking@Home`,repoName:`Docking@Home`,repoUrl:`https://huggingface.co/OpenPeerAI/DockingAtHOME`,filter:!1,countDownloads:`path:"setup.py"`},doctr:{prettyLabel:`docTR`,repoName:`doctr`,repoUrl:`https://github.com/mindee/doctr`},edsnlp:{prettyLabel:`EDS-NLP`,repoName:`edsnlp`,repoUrl:`https://github.com/aphp/edsnlp`,docsUrl:`https://aphp.github.io/edsnlp/latest/`,filter:!1,snippets:ls,countDownloads:`path_filename:"config" AND path_extension:"cfg"`},elm:{prettyLabel:`ELM`,repoName:`elm`,repoUrl:`https://github.com/slicex-ai/elm`,filter:!1,countDownloads:`path_filename:"slicex_elm_config" AND path_extension:"json"`},espnet:{prettyLabel:`ESPnet`,repoName:`ESPnet`,repoUrl:`https://github.com/espnet/espnet`,docsUrl:`https://huggingface.co/docs/hub/espnet`,snippets:ps,filter:!0},fairseq:{prettyLabel:`Fairseq`,repoName:`fairseq`,repoUrl:`https://github.com/pytorch/fairseq`,snippets:ms,filter:!0},fastai:{prettyLabel:`fastai`,repoName:`fastai`,repoUrl:`https://github.com/fastai/fastai`,docsUrl:`https://huggingface.co/docs/hub/fastai`,snippets:ac,filter:!0},fastprint:{prettyLabel:`Fast Print`,repoName:`Fast Print`,repoUrl:`https://huggingface.co/OpenPeerAI/FastPrint`,countDownloads:`path_extension:"cs"`},fasttext:{prettyLabel:`fastText`,repoName:`fastText`,repoUrl:`https://fasttext.cc/`,snippets:wc,filter:!0,countDownloads:`path_extension:"bin"`},fixer:{prettyLabel:`Fixer`,repoName:`Fixer`,repoUrl:`https://github.com/nv-tlabs/Fixer`,filter:!1,countDownloads:`path:"pretrained/pretrained_fixer.pkl"`},flair:{prettyLabel:`Flair`,repoName:`Flair`,repoUrl:`https://github.com/flairNLP/flair`,docsUrl:`https://huggingface.co/docs/hub/flair`,snippets:hs,filter:!0,countDownloads:`path:"pytorch_model.bin"`},fme:{prettyLabel:`Full Model Emulation`,repoName:`Full Model Emulation`,repoUrl:`https://github.com/ai2cm/ace`,docsUrl:`https://ai2-climate-emulator.readthedocs.io/en/latest/`,filter:!1,countDownloads:`path_extension:"tar"`},"gemma.cpp":{prettyLabel:`gemma.cpp`,repoName:`gemma.cpp`,repoUrl:`https://github.com/google/gemma.cpp`,filter:!1,countDownloads:`path_extension:"sbs"`},"geometry-crafter":{prettyLabel:`GeometryCrafter`,repoName:`GeometryCrafter`,repoUrl:`https://github.com/TencentARC/GeometryCrafter`,countDownloads:`path:"point_map_vae/diffusion_pytorch_model.safetensors"`},gliner:{prettyLabel:`GLiNER`,repoName:`GLiNER`,repoUrl:`https://github.com/urchade/GLiNER`,snippets:gs,filter:!1,countDownloads:`path:"gliner_config.json"`},gliner2:{prettyLabel:`GLiNER2`,repoName:`GLiNER2`,repoUrl:`https://github.com/fastino-ai/GLiNER2`,snippets:_s,filter:!1},"glm-tts":{prettyLabel:`GLM-TTS`,repoName:`GLM-TTS`,repoUrl:`https://github.com/zai-org/GLM-TTS`,filter:!1,countDownloads:`path:"flow/flow.pt"`},"glyph-byt5":{prettyLabel:`Glyph-ByT5`,repoName:`Glyph-ByT5`,repoUrl:`https://github.com/AIGText/Glyph-ByT5`,filter:!1,countDownloads:`path:"checkpoints/byt5_model.pt"`},grok:{prettyLabel:`Grok`,repoName:`Grok`,repoUrl:`https://github.com/xai-org/grok-1`,filter:!1,countDownloads:`path:"ckpt/tensor00000_000" OR path:"ckpt-0/tensor00000_000"`},"habibi-tts":{prettyLabel:`Habibi-TTS`,repoName:`Habibi-TTS`,repoUrl:`https://github.com/SWivid/Habibi-TTS`,filter:!1,countDownloads:`path_extension:"safetensors"`},hallo:{prettyLabel:`Hallo`,repoName:`Hallo`,repoUrl:`https://github.com/fudan-generative-vision/hallo`,countDownloads:`path:"hallo/net.pth"`},hermes:{prettyLabel:`HERMES`,repoName:`HERMES`,repoUrl:`https://github.com/LMD0311/HERMES`,filter:!1,countDownloads:`path:"ckpt/hermes_final.pth"`},hezar:{prettyLabel:`Hezar`,repoName:`Hezar`,repoUrl:`https://github.com/hezarai/hezar`,docsUrl:`https://hezarai.github.io/hezar`,countDownloads:`path:"model_config.yaml" OR path:"embedding/embedding_config.yaml"`},htrflow:{prettyLabel:`HTRflow`,repoName:`HTRflow`,repoUrl:`https://github.com/AI-Riksarkivet/htrflow`,docsUrl:`https://ai-riksarkivet.github.io/htrflow`,snippets:ys},"hunyuan-dit":{prettyLabel:`HunyuanDiT`,repoName:`HunyuanDiT`,repoUrl:`https://github.com/Tencent/HunyuanDiT`,countDownloads:`path:"pytorch_model_ema.pt" OR path:"pytorch_model_distill.pt"`},"hunyuan3d-2":{prettyLabel:`Hunyuan3D-2`,repoName:`Hunyuan3D-2`,repoUrl:`https://github.com/Tencent/Hunyuan3D-2`,countDownloads:`path_filename:"model_index" OR path_filename:"config"`},"hunyuanworld-voyager":{prettyLabel:`HunyuanWorld-voyager`,repoName:`HunyuanWorld-voyager`,repoUrl:`https://github.com/Tencent-Hunyuan/HunyuanWorld-Voyager`},"hy-worldplay":{prettyLabel:`HY-WorldPlay`,repoName:`HY-WorldPlay`,repoUrl:`https://github.com/Tencent-Hunyuan/HY-WorldPlay`,filter:!1,countDownloads:`path_extension:"json"`},"image-matching-models":{prettyLabel:`Image Matching Models`,repoName:`Image Matching Models`,repoUrl:`https://github.com/alexstoken/image-matching-models`,filter:!1,countDownloads:`path_extension:"safetensors"`},imstoucan:{prettyLabel:`IMS Toucan`,repoName:`IMS-Toucan`,repoUrl:`https://github.com/DigitalPhonetics/IMS-Toucan`,countDownloads:`path:"embedding_gan.pt" OR path:"Vocoder.pt" OR path:"ToucanTTS.pt"`},"index-tts":{prettyLabel:`IndexTTS`,repoName:`IndexTTS`,repoUrl:`https://github.com/index-tts/index-tts`,snippets:vs,filter:!1},infinitetalk:{prettyLabel:`InfiniteTalk`,repoName:`InfiniteTalk`,repoUrl:`https://github.com/MeiGen-AI/InfiniteTalk`,filter:!1,countDownloads:`path_extension:"safetensors"`},"infinite-you":{prettyLabel:`InfiniteYou`,repoName:`InfiniteYou`,repoUrl:`https://github.com/bytedance/InfiniteYou`,filter:!1,countDownloads:`path:"infu_flux_v1.0/sim_stage1/image_proj_model.bin" OR path:"infu_flux_v1.0/aes_stage2/image_proj_model.bin"`},intellifold:{prettyLabel:`IntelliFold`,repoName:`IntelliFold`,repoUrl:`https://github.com/IntelliGen-AI/IntelliFold`,filter:!1,countDownloads:`path_extension:"pt"`},keras:{prettyLabel:`Keras`,repoName:`Keras`,repoUrl:`https://github.com/keras-team/keras`,docsUrl:`https://huggingface.co/docs/hub/keras`,snippets:bs,filter:!0,countDownloads:`path:"config.json" OR path_extension:"keras"`},"tf-keras":{prettyLabel:`TF-Keras`,repoName:`TF-Keras`,repoUrl:`https://github.com/keras-team/tf-keras`,docsUrl:`https://huggingface.co/docs/hub/tf-keras`,snippets:js,countDownloads:`path:"saved_model.pb"`},"keras-hub":{prettyLabel:`KerasHub`,repoName:`KerasHub`,repoUrl:`https://github.com/keras-team/keras-hub`,docsUrl:`https://keras.io/keras_hub/`,snippets:ws,filter:!0},kernels:{prettyLabel:`Kernels`,repoName:`Kernels`,repoUrl:`https://github.com/huggingface/kernels`,docsUrl:`https://huggingface.co/docs/kernels`,snippets:Ts,countDownloads:`path_filename:"_ops" AND path_extension:"py"`},"kimi-audio":{prettyLabel:`KimiAudio`,repoName:`KimiAudio`,repoUrl:`https://github.com/MoonshotAI/Kimi-Audio`,snippets:Es,filter:!1},kittentts:{prettyLabel:`KittenTTS`,repoName:`KittenTTS`,repoUrl:`https://github.com/KittenML/KittenTTS`,snippets:Ds},kronos:{prettyLabel:`KRONOS`,repoName:`KRONOS`,repoUrl:`https://github.com/mahmoodlab/KRONOS`,filter:!1,countDownloads:`path_extension:"pt"`},k2:{prettyLabel:`K2`,repoName:`k2`,repoUrl:`https://github.com/k2-fsa/k2`},"lightning-ir":{prettyLabel:`Lightning IR`,repoName:`Lightning IR`,repoUrl:`https://github.com/webis-de/lightning-ir`,snippets:Os},litert:{prettyLabel:`LiteRT`,repoName:`LiteRT`,repoUrl:`https://github.com/google-ai-edge/LiteRT`,filter:!1,countDownloads:`path_extension:"tflite"`},"litert-lm":{prettyLabel:`LiteRT-LM`,repoName:`LiteRT-LM`,repoUrl:`https://github.com/google-ai-edge/LiteRT-LM`,filter:!1,countDownloads:`path_extension:"litertlm" OR path_extension:"task"`},lerobot:{prettyLabel:`LeRobot`,repoName:`LeRobot`,repoUrl:`https://github.com/huggingface/lerobot`,docsUrl:`https://huggingface.co/docs/lerobot`,filter:!1,snippets:As},lightglue:{prettyLabel:`LightGlue`,repoName:`LightGlue`,repoUrl:`https://github.com/cvg/LightGlue`,filter:!1,countDownloads:`path_extension:"pth" OR path:"config.json"`},liveportrait:{prettyLabel:`LivePortrait`,repoName:`LivePortrait`,repoUrl:`https://github.com/KwaiVGI/LivePortrait`,filter:!1,countDownloads:`path:"liveportrait/landmark.onnx"`},"llama-cpp-python":{prettyLabel:`llama-cpp-python`,repoName:`llama-cpp-python`,repoUrl:`https://github.com/abetlen/llama-cpp-python`,snippets:ks},"mini-omni2":{prettyLabel:`Mini-Omni2`,repoName:`Mini-Omni2`,repoUrl:`https://github.com/gpt-omni/mini-omni2`,countDownloads:`path:"model_config.yaml"`},mindspore:{prettyLabel:`MindSpore`,repoName:`mindspore`,repoUrl:`https://github.com/mindspore-ai/mindspore`},"magi-1":{prettyLabel:`MAGI-1`,repoName:`MAGI-1`,repoUrl:`https://github.com/SandAI-org/MAGI-1`,countDownloads:`path:"ckpt/vae/config.json"`},"magenta-realtime":{prettyLabel:`Magenta RT`,repoName:`Magenta RT`,repoUrl:`https://github.com/magenta/magenta-realtime`,countDownloads:`path:"checkpoints/llm_base_x4286_c1860k.tar" OR path:"checkpoints/llm_large_x3047_c1860k.tar" OR path:"checkpoints/llm_large_x3047_c1860k/checkpoint"`},"mamba-ssm":{prettyLabel:`MambaSSM`,repoName:`MambaSSM`,repoUrl:`https://github.com/state-spaces/mamba`,filter:!1,snippets:Ms},"manas-1":{prettyLabel:`MANAS-1`,repoName:`MANAS-1`,repoUrl:`https://github.com/NeurodxAI/manas-1`,countDownloads:`path_extension:"pt"`},"mars5-tts":{prettyLabel:`MARS5-TTS`,repoName:`MARS5-TTS`,repoUrl:`https://github.com/Camb-ai/MARS5-TTS`,filter:!1,countDownloads:`path:"mars5_ar.safetensors"`,snippets:Ns},matanyone:{prettyLabel:`MatAnyone`,repoName:`MatAnyone`,repoUrl:`https://github.com/pq-yang/MatAnyone`,snippets:Ps,filter:!1},"mesh-anything":{prettyLabel:`MeshAnything`,repoName:`MeshAnything`,repoUrl:`https://github.com/buaacyw/MeshAnything`,filter:!1,countDownloads:`path:"MeshAnything_350m.pth"`,snippets:Fs},merlin:{prettyLabel:`Merlin`,repoName:`Merlin`,repoUrl:`https://github.com/StanfordMIMI/Merlin`,filter:!1,countDownloads:`path_extension:"pt"`},medvae:{prettyLabel:`MedVAE`,repoName:`MedVAE`,repoUrl:`https://github.com/StanfordMIMI/MedVAE`,filter:!1,countDownloads:`path_extension:"ckpt"`},mitie:{prettyLabel:`MITIE`,repoName:`MITIE`,repoUrl:`https://github.com/mit-nlp/MITIE`,countDownloads:`path_filename:"total_word_feature_extractor"`},"ml-agents":{prettyLabel:`ml-agents`,repoName:`ml-agents`,repoUrl:`https://github.com/Unity-Technologies/ml-agents`,docsUrl:`https://huggingface.co/docs/hub/ml-agents`,snippets:Dc,filter:!0,countDownloads:`path_extension:"onnx"`},"ml-sharp":{prettyLabel:`Sharp`,repoName:`Sharp`,repoUrl:`https://github.com/apple/ml-sharp`,filter:!1,countDownloads:`path_extension:"pt"`},mlx:{prettyLabel:`MLX`,repoName:`MLX`,repoUrl:`https://github.com/ml-explore/mlx-examples/tree/main`,snippets:Jc,filter:!0},"mlx-image":{prettyLabel:`mlx-image`,repoName:`mlx-image`,repoUrl:`https://github.com/riccardomusmeci/mlx-image`,docsUrl:`https://huggingface.co/docs/hub/mlx-image`,snippets:qc,filter:!1,countDownloads:`path:"model.safetensors"`},"mlc-llm":{prettyLabel:`MLC-LLM`,repoName:`MLC-LLM`,repoUrl:`https://github.com/mlc-ai/mlc-llm`,docsUrl:`https://llm.mlc.ai/docs/`,filter:!1,countDownloads:`path:"mlc-chat-config.json"`},model2vec:{prettyLabel:`Model2Vec`,repoName:`model2vec`,repoUrl:`https://github.com/MinishLab/model2vec`,snippets:Yc,filter:!1},moshi:{prettyLabel:`Moshi`,repoName:`Moshi`,repoUrl:`https://github.com/kyutai-labs/moshi`,snippets:e=>{if(e.id.includes(`-mlx`)){let t=e.id.includes(`-q4`)?` -q 4`:e.id.includes(`-q8`)?` -q 8`:``;return[`# pip install moshi_mlx
# Run local inference (macOS Apple Silicon)
python -m moshi_mlx.local${t} --hf-repo "${e.id}"

# Or run with web UI
python -m moshi_mlx.local_web${t} --hf-repo "${e.id}"`]}return e.id.includes(`-candle`)?[`# pip install rustymimi
# Candle backend - see https://github.com/kyutai-labs/moshi
# for Rust installation instructions`]:[`# pip install moshi
# Run the interactive web server
python -m moshi.server --hf-repo "${e.id}"
# Then open https://localhost:8998 in your browser`,`# pip install moshi
import torch
from moshi.models import loaders

# Load checkpoint info from HuggingFace
checkpoint = loaders.CheckpointInfo.from_hf_repo("${e.id}")

# Load the Mimi audio codec
mimi = checkpoint.get_mimi(device="cuda")
mimi.set_num_codebooks(8)

# Encode audio (24kHz, mono)
wav = torch.randn(1, 1, 24000 * 10)  # [batch, channels, samples]
with torch.no_grad():
    codes = mimi.encode(wav.cuda())
    decoded = mimi.decode(codes)`]},filter:!1,countDownloads:`path:"tokenizer-e351c8d8-checkpoint125.safetensors"`},mtvcraft:{prettyLabel:`MTVCraft`,repoName:`MTVCraft`,repoUrl:`https://github.com/baaivision/MTVCraft`,filter:!1,countDownloads:`path:"vae/3d-vae.pt"`},nemo:{prettyLabel:`NeMo`,repoName:`NeMo`,repoUrl:`https://github.com/NVIDIA/NeMo`,snippets:el,filter:!0,countDownloads:`path_extension:"nemo" OR path:"model_config.yaml" OR path_extension:"json"`},"open-oasis":{prettyLabel:`open-oasis`,repoName:`open-oasis`,repoUrl:`https://github.com/etched-ai/open-oasis`,countDownloads:`path:"oasis500m.safetensors"`},open_clip:{prettyLabel:`OpenCLIP`,repoName:`OpenCLIP`,repoUrl:`https://github.com/mlfoundations/open_clip`,snippets:Is,filter:!0,countDownloads:`path:"open_clip_model.safetensors"
			OR path:"model.safetensors"
			OR path:"open_clip_pytorch_model.bin"
			OR path:"pytorch_model.bin"`},openpeerllm:{prettyLabel:`OpenPeerLLM`,repoName:`OpenPeerLLM`,repoUrl:`https://huggingface.co/openpeerai/openpeerllm`,docsUrl:`https://huggingface.co/OpenPeerAI/OpenPeerLLM/blob/main/README.md`,countDownloads:`path:".meta-huggingface.json"`,filter:!1},"open-sora":{prettyLabel:`Open-Sora`,repoName:`Open-Sora`,repoUrl:`https://github.com/hpcaitech/Open-Sora`,filter:!1,countDownloads:`path:"Open_Sora_v2.safetensors"`},outetts:{prettyLabel:`OuteTTS`,repoName:`OuteTTS`,repoUrl:`https://github.com/edwko/OuteTTS`,snippets:tl,filter:!1},paddlenlp:{prettyLabel:`paddlenlp`,repoName:`PaddleNLP`,repoUrl:`https://github.com/PaddlePaddle/PaddleNLP`,docsUrl:`https://huggingface.co/docs/hub/paddlenlp`,snippets:Ls,filter:!0,countDownloads:`path:"model_config.json"`},PaddleOCR:{prettyLabel:`PaddleOCR`,repoName:`PaddleOCR`,repoUrl:`https://github.com/PaddlePaddle/PaddleOCR`,docsUrl:`https://www.paddleocr.ai/`,snippets:Rs,filter:!0,countDownloads:`path_extension:"safetensors" OR path:"inference.pdiparams"`},peft:{prettyLabel:`PEFT`,repoName:`PEFT`,repoUrl:`https://github.com/huggingface/peft`,snippets:Cc,filter:!0,countDownloads:`path:"adapter_config.json"`},"perception-encoder":{prettyLabel:`PerceptionEncoder`,repoName:`PerceptionModels`,repoUrl:`https://github.com/facebookresearch/perception_models`,filter:!1,snippets:zs,countDownloads:`path_extension:"pt"`},"phantom-wan":{prettyLabel:`Phantom`,repoName:`Phantom`,repoUrl:`https://github.com/Phantom-video/Phantom`,snippets:Bs,filter:!1,countDownloads:`path_extension:"pth"`},"pocket-tts":{prettyLabel:`Pocket-TTS`,repoName:`PocketTTS`,repoUrl:`https://github.com/kyutai-labs/pocket-tts`,snippets:Vs,filter:!1,countDownloads:`path:"tts_b6369a24.safetensors"`},"pruna-ai":{prettyLabel:`Pruna AI`,repoName:`Pruna AI`,repoUrl:`https://github.com/PrunaAI/pruna`,snippets:Xc,docsUrl:`https://docs.pruna.ai`},pxia:{prettyLabel:`pxia`,repoName:`pxia`,repoUrl:`https://github.com/not-lain/pxia`,snippets:nl,filter:!1},"pyannote-audio":{prettyLabel:`pyannote.audio`,repoName:`pyannote-audio`,repoUrl:`https://github.com/pyannote/pyannote-audio`,snippets:Ws,filter:!0},"py-feat":{prettyLabel:`Py-Feat`,repoName:`Py-Feat`,repoUrl:`https://github.com/cosanlab/py-feat`,docsUrl:`https://py-feat.org/`,filter:!1},pythae:{prettyLabel:`pythae`,repoName:`pythae`,repoUrl:`https://github.com/clementchadebec/benchmark_VAE`,snippets:rl,filter:!1},quantumpeer:{prettyLabel:`QuantumPeer`,repoName:`QuantumPeer`,repoUrl:`https://github.com/OpenPeer-AI/QuantumPeer`,filter:!1,countDownloads:`path_extension:"setup.py"`},qwen3_tts:{prettyLabel:`Qwen3-TTS`,repoName:`Qwen3-TTS`,repoUrl:`https://github.com/QwenLM/Qwen3-TTS`,snippets:il,filter:!1},recurrentgemma:{prettyLabel:`RecurrentGemma`,repoName:`recurrentgemma`,repoUrl:`https://github.com/google-deepmind/recurrentgemma`,filter:!1,countDownloads:`path:"tokenizer.model"`},relik:{prettyLabel:`Relik`,repoName:`Relik`,repoUrl:`https://github.com/SapienzaNLP/relik`,snippets:Gs,filter:!1},refiners:{prettyLabel:`Refiners`,repoName:`Refiners`,repoUrl:`https://github.com/finegrain-ai/refiners`,docsUrl:`https://refine.rs/`,filter:!1,countDownloads:`path:"model.safetensors"`},renderformer:{prettyLabel:`RenderFormer`,repoName:`RenderFormer`,repoUrl:`https://github.com/microsoft/renderformer`,snippets:Ks,filter:!1},reverb:{prettyLabel:`Reverb`,repoName:`Reverb`,repoUrl:`https://github.com/revdotcom/reverb`,filter:!1},rkllm:{prettyLabel:`RKLLM`,repoName:`RKLLM`,repoUrl:`https://github.com/airockchip/rknn-llm`,countDownloads:`path_extension:"rkllm"`},saelens:{prettyLabel:`SAELens`,repoName:`SAELens`,repoUrl:`https://github.com/jbloomAus/SAELens`,snippets:Qs,filter:!1},sam2:{prettyLabel:`sam2`,repoName:`sam2`,repoUrl:`https://github.com/facebookresearch/segment-anything-2`,filter:!1,snippets:oc,countDownloads:`path_extension:"pt"`},"sam-3d-body":{prettyLabel:`SAM 3D Body`,repoName:`SAM 3D Body`,repoUrl:`https://github.com/facebookresearch/sam-3d-body`,filter:!1,snippets:cc,countDownloads:`path:"model_config.yaml"`},"sam-3d-objects":{prettyLabel:`SAM 3D Objects`,repoName:`SAM 3D Objects`,repoUrl:`https://github.com/facebookresearch/sam-3d-objects`,filter:!1,snippets:sc,countDownloads:`path:"checkpoints/pipeline.yaml"`},same:{prettyLabel:`SAME`,repoName:`SAME`,repoUrl:`https://github.com/GengzeZhou/SAME`,filter:!1,countDownloads:`path:"ckpt/SAME.pt" OR path:"pretrain/Attnq_pretrained_ckpt.pt"`},"sample-factory":{prettyLabel:`sample-factory`,repoName:`sample-factory`,repoUrl:`https://github.com/alex-petrenko/sample-factory`,docsUrl:`https://huggingface.co/docs/hub/sample-factory`,snippets:lc,filter:!0,countDownloads:`path:"cfg.json"`},"sap-rpt-1-oss":{prettyLabel:`sap-rpt-1-oss`,repoName:`sap-rpt-1-oss`,repoUrl:`https://github.com/SAP-samples/sap-rpt-1-oss`,countDownloads:`path_extension:"pt"`,snippets:Io},sapiens:{prettyLabel:`sapiens`,repoName:`sapiens`,repoUrl:`https://github.com/facebookresearch/sapiens`,filter:!1,countDownloads:`path_extension:"pt2" OR path_extension:"pth" OR path_extension:"onnx"`},seedvr:{prettyLabel:`SeedVR`,repoName:`SeedVR`,repoUrl:`https://github.com/ByteDance-Seed/SeedVR`,filter:!1,countDownloads:`path_extension:"pth"`},"self-forcing":{prettyLabel:`SelfForcing`,repoName:`SelfForcing`,repoUrl:`https://github.com/guandeh17/Self-Forcing`,filter:!1,countDownloads:`path_extension:"pt"`},"sentence-transformers":{prettyLabel:`sentence-transformers`,repoName:`sentence-transformers`,repoUrl:`https://github.com/UKPLab/sentence-transformers`,docsUrl:`https://huggingface.co/docs/hub/sentence-transformers`,snippets:dc,filter:!0},setfit:{prettyLabel:`setfit`,repoName:`setfit`,repoUrl:`https://github.com/huggingface/setfit`,docsUrl:`https://huggingface.co/docs/hub/setfit`,snippets:fc,filter:!0},sklearn:{prettyLabel:`Scikit-learn`,repoName:`Scikit-learn`,repoUrl:`https://github.com/scikit-learn/scikit-learn`,snippets:rc,filter:!0,countDownloads:`path:"sklearn_model.joblib"`},spacy:{prettyLabel:`spaCy`,repoName:`spaCy`,repoUrl:`https://github.com/explosion/spaCy`,docsUrl:`https://huggingface.co/docs/hub/spacy`,snippets:pc,filter:!0,countDownloads:`path_extension:"whl"`},"span-marker":{prettyLabel:`SpanMarker`,repoName:`SpanMarkerNER`,repoUrl:`https://github.com/tomaarsen/SpanMarkerNER`,docsUrl:`https://huggingface.co/docs/hub/span_marker`,snippets:mc,filter:!0},speechbrain:{prettyLabel:`speechbrain`,repoName:`speechbrain`,repoUrl:`https://github.com/speechbrain/speechbrain`,docsUrl:`https://huggingface.co/docs/hub/speechbrain`,snippets:_c,filter:!0,countDownloads:`path:"hyperparams.yaml"`},"ssr-speech":{prettyLabel:`SSR-Speech`,repoName:`SSR-Speech`,repoUrl:`https://github.com/WangHelin1997/SSR-Speech`,filter:!1,countDownloads:`path_extension:".pth"`},"stable-audio-tools":{prettyLabel:`Stable Audio Tools`,repoName:`stable-audio-tools`,repoUrl:`https://github.com/Stability-AI/stable-audio-tools.git`,filter:!1,countDownloads:`path:"model.safetensors"`,snippets:ic},monkeyocr:{prettyLabel:`MonkeyOCR`,repoName:`monkeyocr`,repoUrl:`https://github.com/Yuliang-Liu/MonkeyOCR`,filter:!1,countDownloads:`path:"Recognition/config.json"`},"diffusion-single-file":{prettyLabel:`Diffusion Single File`,repoName:`diffusion-single-file`,repoUrl:`https://github.com/comfyanonymous/ComfyUI`,filter:!1,countDownloads:`path_extension:"safetensors"`},"seed-story":{prettyLabel:`SEED-Story`,repoName:`SEED-Story`,repoUrl:`https://github.com/TencentARC/SEED-Story`,filter:!1,countDownloads:`path:"cvlm_llama2_tokenizer/tokenizer.model"`,snippets:$s},soloaudio:{prettyLabel:`SoloAudio`,repoName:`SoloAudio`,repoUrl:`https://github.com/WangHelin1997/SoloAudio`,filter:!1,countDownloads:`path:"soloaudio_v2.pt"`},songbloom:{prettyLabel:`SongBloom`,repoName:`SongBloom`,repoUrl:`https://github.com/Cypress-Yang/SongBloom`,filter:!1,countDownloads:`path_extension:"pt"`},"stable-baselines3":{prettyLabel:`stable-baselines3`,repoName:`stable-baselines3`,repoUrl:`https://github.com/huggingface/huggingface_sb3`,docsUrl:`https://huggingface.co/docs/hub/stable-baselines3`,snippets:Tc,filter:!0,countDownloads:`path_extension:"zip"`},stanza:{prettyLabel:`Stanza`,repoName:`stanza`,repoUrl:`https://github.com/stanfordnlp/stanza`,docsUrl:`https://huggingface.co/docs/hub/stanza`,snippets:hc,filter:!0,countDownloads:`path:"models/default.zip"`},supertonic:{prettyLabel:`Supertonic`,repoName:`Supertonic`,repoUrl:`https://github.com/supertone-inc/supertonic`,snippets:Bc,filter:!1},swarmformer:{prettyLabel:`SwarmFormer`,repoName:`SwarmFormer`,repoUrl:`https://github.com/takara-ai/SwarmFormer`,snippets:Vc,filter:!1},"f5-tts":{prettyLabel:`F5-TTS`,repoName:`F5-TTS`,repoUrl:`https://github.com/SWivid/F5-TTS`,filter:!1,countDownloads:`path_extension:"safetensors" OR path_extension:"pt"`},genmo:{prettyLabel:`Genmo`,repoName:`Genmo`,repoUrl:`https://github.com/genmoai/models`,filter:!1,countDownloads:`path:"vae_stats.json"`},"tencent-song-generation":{prettyLabel:`SongGeneration`,repoName:`SongGeneration`,repoUrl:`https://github.com/tencent-ailab/songgeneration`,filter:!1,countDownloads:`path:"ckpt/songgeneration_base/model.pt"`},tensorflowtts:{prettyLabel:`TensorFlowTTS`,repoName:`TensorFlowTTS`,repoUrl:`https://github.com/TensorSpeech/TensorFlowTTS`,snippets:Xs},tensorrt:{prettyLabel:`TensorRT`,repoName:`TensorRT`,repoUrl:`https://github.com/NVIDIA/TensorRT`,countDownloads:`path_extension:"onnx"`},tabpfn:{prettyLabel:`TabPFN`,repoName:`TabPFN`,repoUrl:`https://github.com/PriorLabs/TabPFN`},terratorch:{prettyLabel:`TerraTorch`,repoName:`TerraTorch`,repoUrl:`https://github.com/IBM/terratorch`,docsUrl:`https://ibm.github.io/terratorch/`,filter:!1,countDownloads:`path_extension:"pt" OR path_extension:"ckpt"`,snippets:vc},"tic-clip":{prettyLabel:`TiC-CLIP`,repoName:`TiC-CLIP`,repoUrl:`https://github.com/apple/ml-tic-clip`,filter:!1,countDownloads:`path_extension:"pt" AND path_prefix:"checkpoints/"`},timesfm:{prettyLabel:`TimesFM`,repoName:`timesfm`,repoUrl:`https://github.com/google-research/timesfm`,filter:!1,countDownloads:`path:"checkpoints/checkpoint_1100000/state/checkpoint" OR path:"checkpoints/checkpoint_2150000/state/checkpoint" OR path_extension:"ckpt"`},timm:{prettyLabel:`timm`,repoName:`pytorch-image-models`,repoUrl:`https://github.com/rwightman/pytorch-image-models`,docsUrl:`https://huggingface.co/docs/hub/timm`,snippets:Zs,filter:!0,countDownloads:`path:"pytorch_model.bin" OR path:"model.safetensors"`},tirex:{prettyLabel:`TiRex`,repoName:`TiRex`,repoUrl:`https://github.com/NX-AI/tirex`,countDownloads:`path_extension:"ckpt"`},torchgeo:{prettyLabel:`TorchGeo`,repoName:`TorchGeo`,repoUrl:`https://github.com/microsoft/torchgeo`,docsUrl:`https://torchgeo.readthedocs.io/`,filter:!1,countDownloads:`path_extension:"pt" OR path_extension:"pth"`},transformers:{prettyLabel:`Transformers`,repoName:`🤗/transformers`,repoUrl:`https://github.com/huggingface/transformers`,docsUrl:`https://huggingface.co/docs/hub/transformers`,snippets:bc,filter:!0},"transformers.js":{prettyLabel:`Transformers.js`,repoName:`transformers.js`,repoUrl:`https://github.com/huggingface/transformers.js`,docsUrl:`https://huggingface.co/docs/hub/transformers-js`,snippets:xc,filter:!0},trellis:{prettyLabel:`Trellis`,repoName:`Trellis`,repoUrl:`https://github.com/microsoft/TRELLIS`,countDownloads:`path_extension:"safetensors"`},ultralytics:{prettyLabel:`ultralytics`,repoName:`ultralytics`,repoUrl:`https://github.com/ultralytics/ultralytics`,docsUrl:`https://github.com/ultralytics/ultralytics`,filter:!1,countDownloads:`path_extension:"pt"`,snippets:Rc},univa:{prettyLabel:`univa`,repoName:`univa`,repoUrl:`https://github.com/PKU-YuanGroup/UniWorld-V1`,snippets:Hc,filter:!0,countDownloads:`path:"config.json"`},"uni-3dar":{prettyLabel:`Uni-3DAR`,repoName:`Uni-3DAR`,repoUrl:`https://github.com/dptech-corp/Uni-3DAR`,docsUrl:`https://github.com/dptech-corp/Uni-3DAR`,countDownloads:`path_extension:"pt"`},"unity-sentis":{prettyLabel:`unity-sentis`,repoName:`unity-sentis`,repoUrl:`https://github.com/Unity-Technologies/sentis-samples`,snippets:Oc,filter:!0,countDownloads:`path_extension:"sentis"`},sana:{prettyLabel:`Sana`,repoName:`Sana`,repoUrl:`https://github.com/NVlabs/Sana`,countDownloads:`path_extension:"pth"`,snippets:kc},videoprism:{prettyLabel:`VideoPrism`,repoName:`VideoPrism`,repoUrl:`https://github.com/google-deepmind/videoprism`,countDownloads:`path_extension:"npz"`,snippets:jc},"vfi-mamba":{prettyLabel:`VFIMamba`,repoName:`VFIMamba`,repoUrl:`https://github.com/MCG-NJU/VFIMamba`,countDownloads:`path_extension:"pkl"`,snippets:Mc},vismatch:{prettyLabel:`VisMatch`,repoName:`VisMatch`,repoUrl:`https://github.com/gmberton/vismatch`,filter:!1,countDownloads:`path:"vismatch.yaml"`},lvface:{prettyLabel:`LVFace`,repoName:`LVFace`,repoUrl:`https://github.com/bytedance/LVFace`,countDownloads:`path_extension:"pt" OR path_extension:"onnx"`,snippets:Nc},voicecraft:{prettyLabel:`VoiceCraft`,repoName:`VoiceCraft`,repoUrl:`https://github.com/jasonppy/VoiceCraft`,docsUrl:`https://github.com/jasonppy/VoiceCraft`,snippets:Pc},voxcpm:{prettyLabel:`VoxCPM`,repoName:`VoxCPM`,repoUrl:`https://github.com/OpenBMB/VoxCPM`,snippets:Fc,filter:!1},vui:{prettyLabel:`Vui`,repoName:`Vui`,repoUrl:`https://github.com/vui-ai/vui`,countDownloads:`path_extension:"pt"`,snippets:Ic},vibevoice:{prettyLabel:`VibeVoice`,repoName:`VibeVoice`,repoUrl:`https://github.com/microsoft/VibeVoice`,snippets:Ac,filter:!1},videox_fun:{prettyLabel:`VideoX Fun`,repoName:`VideoX Fun`,repoUrl:`https://github.com/aigc-apps/VideoX-Fun`,filter:!1,countDownloads:`path_extension:"safetensors"`},"wan2.2":{prettyLabel:`Wan2.2`,repoName:`Wan2.2`,repoUrl:`https://github.com/Wan-Video/Wan2.2`,countDownloads:`path_filename:"config" AND path_extension:"json"`},wham:{prettyLabel:`WHAM`,repoName:`wham`,repoUrl:`https://huggingface.co/microsoft/wham`,docsUrl:`https://huggingface.co/microsoft/wham/blob/main/README.md`,countDownloads:`path_extension:"ckpt"`},whisperkit:{prettyLabel:`WhisperKit`,repoName:`WhisperKit`,repoUrl:`https://github.com/argmaxinc/WhisperKit`,docsUrl:`https://github.com/argmaxinc/WhisperKit?tab=readme-ov-file#homebrew`,snippets:()=>[`# Install CLI with Homebrew on macOS device
brew install whisperkit-cli

# View all available inference options
whisperkit-cli transcribe --help

# Download and run inference using whisper base model
whisperkit-cli transcribe --audio-path /path/to/audio.mp3

# Or use your preferred model variant
whisperkit-cli transcribe --model "large-v3" --model-prefix "distil" --audio-path /path/to/audio.mp3 --verbose`],countDownloads:`path_filename:"model" AND path_extension:"mil" AND _exists_:"path_prefix"`},yolov10:{prettyLabel:`YOLOv10`,repoName:`YOLOv10`,repoUrl:`https://github.com/THU-MIG/yolov10`,docsUrl:`https://github.com/THU-MIG/yolov10`,countDownloads:`path_extension:"pt" OR path_extension:"safetensors"`,snippets:Rc},yolov26:{prettyLabel:`YOLOv26`,repoName:`YOLOv26`,repoUrl:`https://github.com/ultralytics/ultralytics`,docsUrl:`https://docs.ultralytics.com/models/yolo26/`,countDownloads:`path_extension:"pt" OR path_extension:"safetensors"`},zonos:{prettyLabel:`Zonos`,repoName:`Zonos`,repoUrl:`https://github.com/Zyphra/Zonos`,docsUrl:`https://github.com/Zyphra/Zonos`,snippets:e=>[`# pip install git+https://github.com/Zyphra/Zonos.git
import torchaudio
from zonos.model import Zonos
from zonos.conditioning import make_cond_dict

model = Zonos.from_pretrained("${e.id}", device="cuda")

wav, sr = torchaudio.load("speaker.wav")           # 5-10s reference clip
speaker = model.make_speaker_embedding(wav, sr)

cond  = make_cond_dict(text="Hello, world!", speaker=speaker, language="en-us")
codes = model.generate(model.prepare_conditioning(cond))

audio = model.autoencoder.decode(codes)[0].cpu()
torchaudio.save("sample.wav", audio, model.autoencoder.sampling_rate)
`],filter:!1},"3dtopia-xl":{prettyLabel:`3DTopia-XL`,repoName:`3DTopia-XL`,repoUrl:`https://github.com/3DTopia/3DTopia-XL`,filter:!1,countDownloads:`path:"model_vae_fp16.pt"`,snippets:e=>[`from threedtopia_xl.models import threedtopia_xl

model = threedtopia_xl.from_pretrained("${e.id}")
model.generate(cond="path/to/image.png")`]}}).filter(([e,t])=>t.filter).map(([e])=>e);var Z;(function(e){e[e.F32=0]=`F32`,e[e.F16=1]=`F16`,e[e.Q4_0=2]=`Q4_0`,e[e.Q4_1=3]=`Q4_1`,e[e.Q4_1_SOME_F16=4]=`Q4_1_SOME_F16`,e[e.Q4_2=5]=`Q4_2`,e[e.Q4_3=6]=`Q4_3`,e[e.Q8_0=7]=`Q8_0`,e[e.Q5_0=8]=`Q5_0`,e[e.Q5_1=9]=`Q5_1`,e[e.Q2_K=10]=`Q2_K`,e[e.Q3_K_S=11]=`Q3_K_S`,e[e.Q3_K_M=12]=`Q3_K_M`,e[e.Q3_K_L=13]=`Q3_K_L`,e[e.Q4_K_S=14]=`Q4_K_S`,e[e.Q4_K_M=15]=`Q4_K_M`,e[e.Q5_K_S=16]=`Q5_K_S`,e[e.Q5_K_M=17]=`Q5_K_M`,e[e.Q6_K=18]=`Q6_K`,e[e.IQ2_XXS=19]=`IQ2_XXS`,e[e.IQ2_XS=20]=`IQ2_XS`,e[e.Q2_K_S=21]=`Q2_K_S`,e[e.IQ3_XS=22]=`IQ3_XS`,e[e.IQ3_XXS=23]=`IQ3_XXS`,e[e.IQ1_S=24]=`IQ1_S`,e[e.IQ4_NL=25]=`IQ4_NL`,e[e.IQ3_S=26]=`IQ3_S`,e[e.IQ3_M=27]=`IQ3_M`,e[e.IQ2_S=28]=`IQ2_S`,e[e.IQ2_M=29]=`IQ2_M`,e[e.IQ4_XS=30]=`IQ4_XS`,e[e.IQ1_M=31]=`IQ1_M`,e[e.BF16=32]=`BF16`,e[e.Q4_0_4_4=33]=`Q4_0_4_4`,e[e.Q4_0_4_8=34]=`Q4_0_4_8`,e[e.Q4_0_8_8=35]=`Q4_0_8_8`,e[e.TQ1_0=36]=`TQ1_0`,e[e.TQ2_0=37]=`TQ2_0`,e[e.MXFP4_MOE=38]=`MXFP4_MOE`,e[e.Q2_K_XL=1e3]=`Q2_K_XL`,e[e.Q3_K_XL=1001]=`Q3_K_XL`,e[e.Q4_K_XL=1002]=`Q4_K_XL`,e[e.Q5_K_XL=1003]=`Q5_K_XL`,e[e.Q6_K_XL=1004]=`Q6_K_XL`,e[e.Q8_K_XL=1005]=`Q8_K_XL`})(Z||={});var cl=Object.values(Z).filter(e=>typeof e==`string`),ll=RegExp(`(?<prefix>UD-)?(?<quant>${cl.join(`|`)})(_(?<sizeVariation>[A-Z]+))?`);new RegExp(ll,`g`),Z.F32,Z.BF16,Z.F16,Z.Q8_K_XL,Z.Q8_0,Z.Q6_K_XL,Z.Q6_K,Z.Q5_K_XL,Z.Q5_K_M,Z.Q5_K_S,Z.Q5_0,Z.Q5_1,Z.Q4_K_XL,Z.Q4_K_M,Z.Q4_K_S,Z.IQ4_NL,Z.IQ4_XS,Z.Q4_0_4_4,Z.Q4_0_4_8,Z.Q4_0_8_8,Z.Q4_1_SOME_F16,Z.Q4_0,Z.Q4_1,Z.Q4_2,Z.Q4_3,Z.MXFP4_MOE,Z.Q3_K_XL,Z.Q3_K_L,Z.Q3_K_M,Z.Q3_K_S,Z.IQ3_M,Z.IQ3_S,Z.IQ3_XS,Z.IQ3_XXS,Z.Q2_K_XL,Z.Q2_K,Z.Q2_K_S,Z.IQ2_M,Z.IQ2_S,Z.IQ2_XS,Z.IQ2_XXS,Z.IQ1_S,Z.IQ1_M,Z.TQ1_0,Z.TQ2_0;var ul;(function(e){e[e.F32=0]=`F32`,e[e.F16=1]=`F16`,e[e.Q4_0=2]=`Q4_0`,e[e.Q4_1=3]=`Q4_1`,e[e.Q5_0=6]=`Q5_0`,e[e.Q5_1=7]=`Q5_1`,e[e.Q8_0=8]=`Q8_0`,e[e.Q8_1=9]=`Q8_1`,e[e.Q2_K=10]=`Q2_K`,e[e.Q3_K=11]=`Q3_K`,e[e.Q4_K=12]=`Q4_K`,e[e.Q5_K=13]=`Q5_K`,e[e.Q6_K=14]=`Q6_K`,e[e.Q8_K=15]=`Q8_K`,e[e.IQ2_XXS=16]=`IQ2_XXS`,e[e.IQ2_XS=17]=`IQ2_XS`,e[e.IQ3_XXS=18]=`IQ3_XXS`,e[e.IQ1_S=19]=`IQ1_S`,e[e.IQ4_NL=20]=`IQ4_NL`,e[e.IQ3_S=21]=`IQ3_S`,e[e.IQ2_S=22]=`IQ2_S`,e[e.IQ4_XS=23]=`IQ4_XS`,e[e.I8=24]=`I8`,e[e.I16=25]=`I16`,e[e.I32=26]=`I32`,e[e.I64=27]=`I64`,e[e.F64=28]=`F64`,e[e.IQ1_M=29]=`IQ1_M`,e[e.BF16=30]=`BF16`,e[e.TQ1_0=34]=`TQ1_0`,e[e.TQ2_0=35]=`TQ2_0`,e[e.MXFP4=39]=`MXFP4`})(ul||={});var dl=[`python`,`js`,`sh`],fl={js:{fetch:{basic:`async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.json();
	return result;
}

query({ inputs: {{ providerInputs.asObj.inputs }} }).then((response) => {
    console.log(JSON.stringify(response));
});`,basicAudio:`async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "audio/flac",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.json();
	return result;
}

query({ inputs: {{ providerInputs.asObj.inputs }} }).then((response) => {
    console.log(JSON.stringify(response));
});`,basicImage:`async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "image/jpeg",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.json();
	return result;
}

query({ inputs: {{ providerInputs.asObj.inputs }} }).then((response) => {
    console.log(JSON.stringify(response));
});`,conversational:`async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.json();
	return result;
}

query({ 
{{ autoInputs.asTsString }}
}).then((response) => {
    console.log(JSON.stringify(response));
});`,imageToImage:`const image = fs.readFileSync("{{inputs.asObj.inputs}}");

async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "image/jpeg",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: {
				"inputs": \`data:image/png;base64,\${data.inputs.encode("base64")}\`,
				"parameters": data.parameters,
			}
		}
	);
	const result = await response.json();
	return result;
}

query({ 
	inputs: image,
	parameters: {
		prompt: "{{ inputs.asObj.parameters.prompt }}",
	}
}).then((response) => {
    console.log(JSON.stringify(response));
});`,imageToVideo:`const image = fs.readFileSync("{{inputs.asObj.inputs}}");

async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "image/jpeg",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: {
				"image_url": \`data:image/png;base64,\${data.image.encode("base64")}\`,
				"prompt": data.prompt,
			}
		}
	);
	const result = await response.json();
	return result;
}

query({
	"image": image,
	"prompt": "{{inputs.asObj.parameters.prompt}}",
}).then((response) => {
    // Use video
});`,textToAudio:`{% if model.library_name == "transformers" %}
async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.blob();
    return result;
}

query({ inputs: {{ providerInputs.asObj.inputs }} }).then((response) => {
    // Returns a byte object of the Audio wavform. Use it directly!
});
{% else %}
async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
    const result = await response.json();
    return result;
}

query({ inputs: {{ providerInputs.asObj.inputs }} }).then((response) => {
    console.log(JSON.stringify(response));
});
{% endif %} `,textToImage:`async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.blob();
	return result;
}


query({ {{ providerInputs.asTsString }} }).then((response) => {
    // Use image
});`,textToSpeech:`{% if model.library_name == "transformers" %}
async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
{% if billTo %}
				"X-HF-Bill-To": "{{ billTo }}",
{% endif %}			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
	const result = await response.blob();
    return result;
}

query({ text: {{ inputs.asObj.inputs }} }).then((response) => {
    // Returns a byte object of the Audio wavform. Use it directly!
});
{% else %}
async function query(data) {
	const response = await fetch(
		"{{ fullUrl }}",
		{
			headers: {
				Authorization: "{{ authorizationHeader }}",
				"Content-Type": "application/json",
			},
			method: "POST",
			body: JSON.stringify(data),
		}
	);
    const result = await response.json();
    return result;
}

query({ text: {{ inputs.asObj.inputs }} }).then((response) => {
    console.log(JSON.stringify(response));
});
{% endif %} `,zeroShotClassification:`async function query(data) {
    const response = await fetch(
		"{{ fullUrl }}",
        {
            headers: {
				Authorization: "{{ authorizationHeader }}",
                "Content-Type": "application/json",
{% if billTo %}
                "X-HF-Bill-To": "{{ billTo }}",
{% endif %}         },
            method: "POST",
            body: JSON.stringify(data),
        }
    );
    const result = await response.json();
    return result;
}

query({
    inputs: {{ providerInputs.asObj.inputs }},
    parameters: { candidate_labels: ["refund", "legal", "faq"] }
}).then((response) => {
    console.log(JSON.stringify(response));
});`},"huggingface.js":{basic:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const output = await client.{{ methodName }}({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
	model: "{{ model.id }}",
	inputs: {{ inputs.asObj.inputs }},
	provider: "{{ provider }}",
}{% if billTo %}, {
	billTo: "{{ billTo }}",
}{% endif %});

console.log(output);`,basicAudio:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const data = fs.readFileSync({{inputs.asObj.inputs}});

const output = await client.{{ methodName }}({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
	data,
	model: "{{ model.id }}",
	provider: "{{ provider }}",
}{% if billTo %}, {
	billTo: "{{ billTo }}",
}{% endif %});

console.log(output);`,basicImage:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const data = fs.readFileSync({{inputs.asObj.inputs}});

const output = await client.{{ methodName }}({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
	data,
	model: "{{ model.id }}",
	provider: "{{ provider }}",
}{% if billTo %}, {
	billTo: "{{ billTo }}",
}{% endif %});

console.log(output);`,conversational:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const chatCompletion = await client.chatCompletion({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
{% if directRequest %}
    provider: "{{ provider }}",
    model: "{{ model.id }}",
{% else %}
    model: "{{ providerModelId }}",
{% endif %}
{{ inputs.asTsString }}
}{% if billTo %}, {
    billTo: "{{ billTo }}",
}{% endif %});

console.log(chatCompletion.choices[0].message);`,conversationalStream:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

let out = "";

const stream = client.chatCompletionStream({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
    model: "{{ providerModelId }}",
{{ inputs.asTsString }}
}{% if billTo %}, {
    billTo: "{{ billTo }}",
}{% endif %});

for await (const chunk of stream) {
	if (chunk.choices && chunk.choices.length > 0) {
		const newContent = chunk.choices[0].delta.content;
		out += newContent;
		console.log(newContent);
	}
}`,imageToImage:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const data = fs.readFileSync("{{inputs.asObj.inputs}}");

const image = await client.imageToImage({
{% if endpointUrl %}
	endpointUrl: "{{ endpointUrl }}",
{% endif %}
	provider: "{{provider}}",
	model: "{{model.id}}",
	inputs: data,
	parameters: { prompt: "{{inputs.asObj.parameters.prompt}}", },
}{% if billTo %}, {
	billTo: "{{ billTo }}",
}{% endif %});
/// Use the generated image (it's a Blob)
// For example, you can save it to a file or display it in an image element
`,imageToVideo:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const data = fs.readFileSync("{{inputs.asObj.inputs}}");

const video = await client.imageToVideo({
{% if endpointUrl %}
	endpointUrl: "{{ endpointUrl }}",
{% endif %}
	provider: "{{provider}}",
	model: "{{model.id}}",
	inputs: data,
	parameters: { prompt: "{{inputs.asObj.parameters.prompt}}", },
}{% if billTo %}, {
	billTo: "{{ billTo }}",
}{% endif %});

/// Use the generated video (it's a Blob)
// For example, you can save it to a file or display it in a video element
`,textToImage:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const image = await client.textToImage({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
    provider: "{{ provider }}",
    model: "{{ model.id }}",
	inputs: {{ inputs.asObj.inputs }},
	parameters: { num_inference_steps: 5 },
}{% if billTo %}, {
    billTo: "{{ billTo }}",
}{% endif %});
/// Use the generated image (it's a Blob)`,textToSpeech:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const audio = await client.textToSpeech({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
    provider: "{{ provider }}",
    model: "{{ model.id }}",
	inputs: {{ inputs.asObj.inputs }},
}{% if billTo %}, {
    billTo: "{{ billTo }}",
}{% endif %});
// Use the generated audio (it's a Blob)`,textToVideo:`import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient("{{ accessToken }}");

const video = await client.textToVideo({
{% if endpointUrl %}
    endpointUrl: "{{ endpointUrl }}",
{% endif %}
    provider: "{{ provider }}",
    model: "{{ model.id }}",
	inputs: {{ inputs.asObj.inputs }},
}{% if billTo %}, {
    billTo: "{{ billTo }}",
}{% endif %});
// Use the generated video (it's a Blob)`},openai:{conversational:`import { OpenAI } from "openai";

const client = new OpenAI({
	baseURL: "{{ baseUrl }}",
	apiKey: "{{ accessToken }}",
{% if billTo %}
	defaultHeaders: {
		"X-HF-Bill-To": "{{ billTo }}" 
	}
{% endif %}
});

const chatCompletion = await client.chat.completions.create({
	model: "{{ providerModelId }}",
{{ inputs.asTsString }}
});

console.log(chatCompletion.choices[0].message);`,conversationalStream:`import { OpenAI } from "openai";

const client = new OpenAI({
	baseURL: "{{ baseUrl }}",
	apiKey: "{{ accessToken }}",
{% if billTo %}
    defaultHeaders: {
		"X-HF-Bill-To": "{{ billTo }}" 
	}
{% endif %}
});

const stream = await client.chat.completions.create({
    model: "{{ providerModelId }}",
{{ inputs.asTsString }}
    stream: true,
});

for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
}`}},python:{fal_client:{imageToImage:`{%if provider == "fal-ai" %}
import fal_client
import base64

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
           print(log["message"])

with open("{{inputs.asObj.inputs}}", "rb") as image_file:
    image_base_64 = base64.b64encode(image_file.read()).decode('utf-8')

result = fal_client.subscribe(
    "fal-ai/flux-kontext/dev",
    arguments={
        "prompt": f"data:image/png;base64,{image_base_64}",
        "image_url": "{{ providerInputs.asObj.inputs }}",
    },
    with_logs=True,
    on_queue_update=on_queue_update,
)
print(result)
{%endif%}
`,imageToVideo:`{%if provider == "fal-ai" %}
import fal_client
import base64

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
           print(log["message"])

with open("{{inputs.asObj.inputs}}", "rb") as image_file:
    image_base_64 = base64.b64encode(image_file.read()).decode('utf-8')

result = fal_client.subscribe(
    "{{model.id}}",
    arguments={
        "image_url": f"data:image/png;base64,{image_base_64}",
        "prompt": "{{inputs.asObj.parameters.prompt}}",
    },
    with_logs=True,
    on_queue_update=on_queue_update,
)
print(result)
{%endif%}
`,textToImage:`{% if provider == "fal-ai" %}
import fal_client

{% if providerInputs.asObj.loras is defined and providerInputs.asObj.loras != none %}
result = fal_client.subscribe(
    "{{ providerModelId }}",
    arguments={
        "prompt": {{ inputs.asObj.inputs }},
        "loras":{{ providerInputs.asObj.loras | tojson }},
    },
)
{% else %}
result = fal_client.subscribe(
    "{{ providerModelId }}",
    arguments={
        "prompt": {{ inputs.asObj.inputs }},
    },
)
{% endif %} 
print(result)
{% endif %} `},huggingface_hub:{basic:`result = client.{{ methodName }}(
    {{ inputs.asObj.inputs }},
    model="{{ model.id }}",
)`,basicAudio:`output = client.{{ methodName }}({{ inputs.asObj.inputs }}, model="{{ model.id }}")`,basicImage:`output = client.{{ methodName }}({{ inputs.asObj.inputs }}, model="{{ model.id }}")`,conversational:`completion = client.chat.completions.create(
{% if directRequest %}
    model="{{ model.id }}",
{% else %}
    model="{{ providerModelId }}",
{% endif %}
{{ inputs.asPythonString }}
)

print(completion.choices[0].message) `,conversationalStream:`stream = client.chat.completions.create(
    model="{{ providerModelId }}",
{{ inputs.asPythonString }}
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content, end="") `,documentQuestionAnswering:`output = client.document_question_answering(
    "{{ inputs.asObj.image }}",
    question="{{ inputs.asObj.question }}",
    model="{{ model.id }}",
) `,imageToImage:`with open("{{ inputs.asObj.inputs }}", "rb") as image_file:
   input_image = image_file.read()

# output is a PIL.Image object
image = client.image_to_image(
    input_image,
    prompt="{{ inputs.asObj.parameters.prompt }}",
    model="{{ model.id }}",
)
`,imageToVideo:`with open("{{ inputs.asObj.inputs }}", "rb") as image_file:
   input_image = image_file.read()

video = client.image_to_video(
    input_image,
    prompt="{{ inputs.asObj.parameters.prompt }}",
    model="{{ model.id }}",
) 
`,importInferenceClient:`from huggingface_hub import InferenceClient

client = InferenceClient(
{% if endpointUrl %}
    base_url="{{ baseUrl }}",
{% endif %}
{% if task != "conversational" or directRequest %}
    provider="{{ provider }}",
{% endif %}
    api_key="{{ accessToken }}",
{% if billTo %}
    bill_to="{{ billTo }}",
{% endif %}
)`,questionAnswering:`answer = client.question_answering(
    question="{{ inputs.asObj.question }}",
    context="{{ inputs.asObj.context }}",
    model="{{ model.id }}",
) `,tableQuestionAnswering:`answer = client.table_question_answering(
    query="{{ inputs.asObj.query }}",
    table={{ inputs.asObj.table }},
    model="{{ model.id }}",
) `,textToImage:`# output is a PIL.Image object
image = client.text_to_image(
    {{ inputs.asObj.inputs }},
    model="{{ model.id }}",
) `,textToSpeech:`# audio is returned as bytes
audio = client.text_to_speech(
    {{ inputs.asObj.inputs }},
    model="{{ model.id }}",
) 
`,textToVideo:`video = client.text_to_video(
    {{ inputs.asObj.inputs }},
    model="{{ model.id }}",
) `},openai:{conversational:`from openai import OpenAI

client = OpenAI(
    base_url="{{ baseUrl }}",
    api_key="{{ accessToken }}",
{% if billTo %}
    default_headers={
        "X-HF-Bill-To": "{{ billTo }}"
    }
{% endif %}
)

completion = client.chat.completions.create(
    model="{{ providerModelId }}",
{{ inputs.asPythonString }}
)

print(completion.choices[0].message) `,conversationalStream:`from openai import OpenAI

client = OpenAI(
    base_url="{{ baseUrl }}",
    api_key="{{ accessToken }}",
{% if billTo %}
    default_headers={
        "X-HF-Bill-To": "{{ billTo }}"
    }
{% endif %}
)

stream = client.chat.completions.create(
    model="{{ providerModelId }}",
{{ inputs.asPythonString }}
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content, end="")`},requests:{basic:`def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

output = query({
    "inputs": {{ providerInputs.asObj.inputs }},
}) `,basicAudio:`def query(filename):
    with open(filename, "rb") as f:
        data = f.read()
    response = requests.post(API_URL, headers={"Content-Type": "audio/flac", **headers}, data=data)
    return response.json()

output = query({{ providerInputs.asObj.inputs }})`,basicImage:`def query(filename):
    with open(filename, "rb") as f:
        data = f.read()
    response = requests.post(API_URL, headers={"Content-Type": "image/jpeg", **headers}, data=data)
    return response.json()

output = query({{ providerInputs.asObj.inputs }})`,conversational:`def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

response = query({
{{ autoInputs.asJsonString }}
})

print(response["choices"][0]["message"])`,conversationalStream:`def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload, stream=True)
    for line in response.iter_lines():
        if not line.startswith(b"data:"):
            continue
        if line.strip() == b"data: [DONE]":
            return
        yield json.loads(line.decode("utf-8").lstrip("data:").rstrip("/n"))

chunks = query({
{{ autoInputs.asJsonString }},
    "stream": True,
})

for chunk in chunks:
    print(chunk["choices"][0]["delta"]["content"], end="")`,documentQuestionAnswering:`def query(payload):
    with open(payload["image"], "rb") as f:
        img = f.read()
        payload["image"] = base64.b64encode(img).decode("utf-8")
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

output = query({
    "inputs": {
        "image": "{{ inputs.asObj.image }}",
        "question": "{{ inputs.asObj.question }}",
    },
}) `,imageToImage:`
def query(payload):
    with open(payload["inputs"], "rb") as f:
        img = f.read()
        payload["inputs"] = base64.b64encode(img).decode("utf-8")
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.content

image_bytes = query({
{{ providerInputs.asJsonString }}
})

# You can access the image with PIL.Image for example
import io
from PIL import Image
image = Image.open(io.BytesIO(image_bytes)) `,imageToVideo:`
def query(payload):
    with open(payload["inputs"], "rb") as f:
        img = f.read()
        payload["inputs"] = base64.b64encode(img).decode("utf-8")
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.content

video_bytes = query({
{{ inputs.asJsonString }}
})
`,importRequests:`{% if importBase64 %}
import base64
{% endif %}
{% if importJson %}
import json
{% endif %}
import requests

API_URL = "{{ fullUrl }}"
headers = {
    "Authorization": "{{ authorizationHeader }}",
{% if billTo %}
    "X-HF-Bill-To": "{{ billTo }}"
{% endif %}
}`,tabular:`def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.content

response = query({
    "inputs": {
        "data": {{ providerInputs.asObj.inputs }}
    },
}) `,textToAudio:`{% if model.library_name == "transformers" %}
def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.content

audio_bytes = query({
    "inputs": {{ inputs.asObj.inputs }},
})
# You can access the audio with IPython.display for example
from IPython.display import Audio
Audio(audio_bytes)
{% else %}
def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

audio, sampling_rate = query({
    "inputs": {{ inputs.asObj.inputs }},
})
# You can access the audio with IPython.display for example
from IPython.display import Audio
Audio(audio, rate=sampling_rate)
{% endif %} `,textToImage:`{% if provider == "hf-inference" %}
def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.content

image_bytes = query({
    "inputs": {{ providerInputs.asObj.inputs }},
})

# You can access the image with PIL.Image for example
import io
from PIL import Image
image = Image.open(io.BytesIO(image_bytes))
{% endif %}`,textToSpeech:`{% if model.library_name == "transformers" %}
def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.content

audio_bytes = query({
    "text": {{ inputs.asObj.inputs }},
})
# You can access the audio with IPython.display for example
from IPython.display import Audio
Audio(audio_bytes)
{% else %}
def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

audio, sampling_rate = query({
    "text": {{ inputs.asObj.inputs }},
})
# You can access the audio with IPython.display for example
from IPython.display import Audio
Audio(audio, rate=sampling_rate)
{% endif %} `,zeroShotClassification:`def query(payload):
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

output = query({
    "inputs": {{ providerInputs.asObj.inputs }},
    "parameters": {"candidate_labels": ["refund", "legal", "faq"]},
}) `,zeroShotImageClassification:`def query(data):
    with open(data["image_path"], "rb") as f:
        img = f.read()
    payload={
        "parameters": data["parameters"],
        "inputs": base64.b64encode(img).decode("utf-8")
    }
    response = requests.post(API_URL, headers=headers, json=payload)
    return response.json()

output = query({
    "image_path": {{ providerInputs.asObj.inputs }},
    "parameters": {"candidate_labels": ["cat", "dog", "llama"]},
}) `}},sh:{curl:{basic:`curl {{ fullUrl }} \\
    -X POST \\
    -H 'Authorization: {{ authorizationHeader }}' \\
    -H 'Content-Type: application/json' \\
{% if billTo %}
    -H 'X-HF-Bill-To: {{ billTo }}' \\
{% endif %}
    -d '{
{{ providerInputs.asCurlString }}
    }'`,basicAudio:`curl {{ fullUrl }} \\
    -X POST \\
    -H 'Authorization: {{ authorizationHeader }}' \\
    -H 'Content-Type: audio/flac' \\
{% if billTo %}
    -H 'X-HF-Bill-To: {{ billTo }}' \\
{% endif %}
    --data-binary @{{ providerInputs.asObj.inputs }}`,basicImage:`curl {{ fullUrl }} \\
    -X POST \\
    -H 'Authorization: {{ authorizationHeader }}' \\
    -H 'Content-Type: image/jpeg' \\
{% if billTo %}
    -H 'X-HF-Bill-To: {{ billTo }}' \\
{% endif %}
    --data-binary @{{ providerInputs.asObj.inputs }}`,conversational:`curl {{ fullUrl }} \\
    -H 'Authorization: {{ authorizationHeader }}' \\
    -H 'Content-Type: application/json' \\
{% if billTo %}
    -H 'X-HF-Bill-To: {{ billTo }}' \\
{% endif %}
    -d '{
{{ autoInputs.asCurlString }},
        "stream": false
    }'`,conversationalStream:`curl {{ fullUrl }} \\
    -H 'Authorization: {{ authorizationHeader }}' \\
    -H 'Content-Type: application/json' \\
{% if billTo %}
    -H 'X-HF-Bill-To: {{ billTo }}' \\
{% endif %}
    -d '{
{{ autoInputs.asCurlString }},
        "stream": true
    }'`,zeroShotClassification:`curl {{ fullUrl }} \\
    -X POST \\
    -d '{"inputs": {{ providerInputs.asObj.inputs }}, "parameters": {"candidate_labels": ["refund", "legal", "faq"]}}' \\
    -H 'Content-Type: application/json' \\
    -H 'Authorization: {{ authorizationHeader }}'
{% if billTo %} \\
    -H 'X-HF-Bill-To: {{ billTo }}'
{% endif %}`}}},pl=[`openai`,`huggingface_hub`,`fal_client`,`requests`],ml=[`openai`,`huggingface.js`,`fetch`],hl=[`curl`],gl={js:[...ml],python:[...pl],sh:[...hl]},_l={js:[`huggingface.js`],python:[`huggingface_hub`]},vl=(e,t,n)=>fl[e]?.[t]?.[n]!==void 0,yl=(e,t,n)=>{let r=fl[e]?.[t]?.[n];if(!r)throw Error(`Template not found: ${e}/${t}/${n}`);return e=>new Hi(r).render({...e})},bl=yl(`python`,`huggingface_hub`,`importInferenceClient`),xl=yl(`python`,`requests`,`importRequests`),Sl={"audio-classification":`audio_classification`,"audio-to-audio":`audio_to_audio`,"automatic-speech-recognition":`automatic_speech_recognition`,"document-question-answering":`document_question_answering`,"feature-extraction":`feature_extraction`,"fill-mask":`fill_mask`,"image-classification":`image_classification`,"image-segmentation":`image_segmentation`,"image-to-image":`image_to_image`,"image-to-video":`image_to_video`,"image-to-text":`image_to_text`,"image-text-to-image":`image_text_to_image`,"image-text-to-video":`image_text_to_video`,"object-detection":`object_detection`,"question-answering":`question_answering`,"sentence-similarity":`sentence_similarity`,summarization:`summarization`,"table-question-answering":`table_question_answering`,"tabular-classification":`tabular_classification`,"tabular-regression":`tabular_regression`,"text-classification":`text_classification`,"text-generation":`text_generation`,"text-to-image":`text_to_image`,"text-to-speech":`text_to_speech`,"text-to-video":`text_to_video`,"token-classification":`token_classification`,translation:`translation`,"visual-question-answering":`visual_question_answering`,"zero-shot-classification":`zero_shot_classification`,"zero-shot-image-classification":`zero_shot_image_classification`},Cl={"automatic-speech-recognition":`automaticSpeechRecognition`,"feature-extraction":`featureExtraction`,"fill-mask":`fillMask`,"image-classification":`imageClassification`,"question-answering":`questionAnswering`,"sentence-similarity":`sentenceSimilarity`,summarization:`summarization`,"table-question-answering":`tableQuestionAnswering`,"text-classification":`textClassification`,"text-generation":`textGeneration`,"token-classification":`tokenClassification`,"text-to-speech":`textToSpeech`,translation:`translation`},wl=`hf_token_placeholder`,Tl=`not_hf_token_placeholder`,Q=(e,t)=>(n,i,a,o)=>{let s=Me(),c=a?.providerId??n.id,l=n.pipeline_tag;n.pipeline_tag&&[`text-generation`,`image-text-to-text`].includes(n.pipeline_tag)&&n.tags.includes(`conversational`)&&(e=o?.streaming?`conversationalStream`:`conversational`,t=Ol,l=`conversational`);let u;try{u=T(i,l)}catch(e){return s.error(`Failed to get provider helper for ${i} (${l})`,e),[]}let d=o?.directRequest?Tl:wl,f=o?.accessToken??d,p=o?.inputs?{inputs:o.inputs}:t?t(n,o):{inputs:vo(n)},m=Cn(c,u,{accessToken:f,provider:i,endpointUrl:o?.endpointUrl??(i===`auto`?r:void 0),...p},a,{task:l,billTo:o?.billTo}),h=p,g=m.info.body;if(typeof g==`string`)try{h=JSON.parse(g)}catch(e){s.error(`Failed to parse body as JSON`,e)}let _=!o?.endpointUrl&&!o?.directRequest?i===`auto`?{...p,model:`${n.id}`}:{...p,model:`${n.id}:${i}`}:h,v={accessToken:f,authorizationHeader:m.info.headers?.Authorization,baseUrl:l===`conversational`&&!o?.endpointUrl&&!o?.directRequest?r:Nl(m.url,`/chat/completions`),fullUrl:l===`conversational`&&!o?.endpointUrl&&!o?.directRequest?r+`/chat/completions`:m.url,inputs:{asObj:p,asCurlString:$(p,`curl`),asJsonString:$(p,`json`),asPythonString:$(p,`python`),asTsString:$(p,`ts`)},providerInputs:{asObj:h,asCurlString:$(h,`curl`),asJsonString:$(h,`json`),asPythonString:$(h,`python`),asTsString:$(h,`ts`)},autoInputs:{asObj:_,asCurlString:$(_,`curl`),asJsonString:$(_,`json`),asPythonString:$(_,`python`),asTsString:$(_,`ts`)},model:n,provider:i,providerModelId:l===`conversational`&&!o?.endpointUrl&&!o?.directRequest?i===`auto`?n.id:`${n.id}:${i}`:c??n.id,billTo:o?.billTo,endpointUrl:o?.endpointUrl,task:l,directRequest:!!o?.directRequest},y=i===`auto`&&l!==`conversational`?_l:gl;return dl.map(t=>(y[t]??[]).map(r=>{if(!vl(t,r,e))return;let a=yl(t,r,e);if(r===`huggingface_hub`&&e.includes(`basic`)){if(!(n.pipeline_tag&&n.pipeline_tag in Sl))return;v.methodName=Sl[n.pipeline_tag]}if(r===`huggingface.js`&&e.includes(`basic`)){if(!(n.pipeline_tag&&n.pipeline_tag in Cl))return;v.methodName=Cl[n.pipeline_tag]}let s=a(v).trim();if(s)return r===`huggingface_hub`?s=`${bl({...v})}\n\n${s}`:r===`requests`&&(s=`${xl({...v,importBase64:s.includes(`base64`),importJson:s.includes(`json.`)})}\n\n${s}`),s.includes(d)&&(s=Pl(o?.directRequest,d,s,t,i,o?.endpointUrl)),{language:t,client:r,content:s}}).filter(e=>e!==void 0)).flat()},El=e=>JSON.parse(vo(e)),Dl=e=>{let t=JSON.parse(vo(e));return{inputs:t.image,parameters:{prompt:t.prompt}}},Ol=(e,t)=>({messages:t?.messages??vo(e),...t?.temperature?{temperature:t?.temperature}:void 0,...t?.max_tokens?{max_tokens:t?.max_tokens}:void 0,...t?.top_p?{top_p:t?.top_p}:void 0}),kl={"audio-classification":Q(`basicAudio`),"audio-to-audio":Q(`basicAudio`),"automatic-speech-recognition":Q(`basicAudio`),"document-question-answering":Q(`documentQuestionAnswering`,El),"feature-extraction":Q(`basic`),"fill-mask":Q(`basic`),"image-classification":Q(`basicImage`),"image-segmentation":Q(`basicImage`),"image-text-to-image":Q(`imageToImage`,Dl),"image-text-to-text":Q(`conversational`),"image-text-to-video":Q(`imageToVideo`,Dl),"image-to-image":Q(`imageToImage`,Dl),"image-to-text":Q(`basicImage`),"image-to-video":Q(`imageToVideo`,Dl),"object-detection":Q(`basicImage`),"question-answering":Q(`questionAnswering`,e=>{let t=JSON.parse(vo(e));return{question:t.question,context:t.context}}),"sentence-similarity":Q(`basic`),summarization:Q(`basic`),"tabular-classification":Q(`tabular`),"tabular-regression":Q(`tabular`),"table-question-answering":Q(`tableQuestionAnswering`,e=>{let t=JSON.parse(vo(e));return{query:t.query,table:JSON.stringify(t.table)}}),"text-classification":Q(`basic`),"text-generation":Q(`basic`),"text-to-audio":Q(`textToAudio`),"text-to-image":Q(`textToImage`),"text-to-speech":Q(`textToSpeech`),"text-to-video":Q(`textToVideo`),"token-classification":Q(`basic`),translation:Q(`basic`),"zero-shot-classification":Q(`zeroShotClassification`),"zero-shot-image-classification":Q(`zeroShotImageClassification`)};function Al(e,t,n,r){return e.pipeline_tag&&e.pipeline_tag in kl?kl[e.pipeline_tag]?.(e,t,n,r)??[]:[]}function $(e,t){switch(t){case`curl`:return Ml($(e,`json`));case`json`:return JSON.stringify(e,null,4).split(`
`).slice(1,-1).join(`
`);case`python`:return Ml(Object.entries(e).map(([e,t])=>`${e}=${JSON.stringify(t,null,4).replace(/"/g,`"`)},`).join(`
`));case`ts`:return jl(e).split(`
`).slice(1,-1).join(`
`);default:throw Error(`Unsupported format: ${t}`)}}function jl(e,t){return t??=0,typeof e!=`object`||!e?JSON.stringify(e):Array.isArray(e)?`[\n${e.map(e=>{let n=jl(e,t+1);return`${` `.repeat(4*(t+1))}${n},`}).join(`
`)}\n${` `.repeat(4*t)}]`:`{\n${Object.entries(e).map(([e,n])=>{let r=jl(n,t+1),i=/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(e)?e:`"${e}"`;return`${` `.repeat(4*(t+1))}${i}: ${r},`}).join(`
`)}\n${` `.repeat(4*t)}}`}function Ml(e){return e.split(`
`).map(e=>` `.repeat(4)+e).join(`
`)}function Nl(e,t){return e.endsWith(t)?e.slice(0,-t.length):e}function Pl(e,t,n,r,i,a){let o=!a&&(i==`hf-inference`||!e&&(n.includes(`InferenceClient`)||n.includes(`https://router.huggingface.co`)))?`HF_TOKEN`:a?`API_TOKEN`:i.toUpperCase().replace(`-`,`_`)+`_API_KEY`;return r===`sh`?n=n.replace(`'Authorization: Bearer ${t}'`,`"Authorization: Bearer $${o}"`):r===`python`?(n=`import os
`+n,n=n.replace(`"${t}"`,`os.environ["${o}"]`),n=n.replace(`"Bearer ${t}"`,`f"Bearer {os.environ['${o}']}"`),n=n.replace(`"Key ${t}"`,`f"Key {os.environ['${o}']}"`),n=n.replace(`"X-Key ${t}"`,`f"X-Key {os.environ['${o}']}"`)):r===`js`&&(n=n.replace(`"${t}"`,`process.env.${o}`),n=n.replace(`Authorization: "Bearer ${t}",`,`Authorization: \`Bearer $\{process.env.${o}}\`,`),n=n.replace(`Authorization: "Key ${t}",`,`Authorization: \`Key $\{process.env.${o}}\`,`),n=n.replace(`Authorization: "X-Key ${t}",`,`Authorization: \`X-Key $\{process.env.${o}}\`,`)),n}var Fl=e({getInferenceSnippets:()=>Al}),Il=e({HfInference:()=>yr,INFERENCE_PROVIDERS:()=>xr,InferenceClient:()=>vr,InferenceClientEndpoint:()=>br,InferenceClientError:()=>o,InferenceClientHubApiError:()=>d,InferenceClientInputError:()=>s,InferenceClientProviderApiError:()=>u,InferenceClientProviderOutputError:()=>f,InferenceClientRoutingError:()=>c,PROVIDERS:()=>yn,PROVIDERS_HUB_ORGS:()=>Cr,PROVIDERS_OR_POLICIES:()=>Sr,audioClassification:()=>Fn,audioToAudio:()=>In,automaticSpeechRecognition:()=>Ln,chatCompletion:()=>Qn,chatCompletionStream:()=>$n,documentQuestionAnswering:()=>fr,featureExtraction:()=>er,fillMask:()=>tr,getProviderHelper:()=>T,imageClassification:()=>Bn,imageSegmentation:()=>Vn,imageTextToImage:()=>Gn,imageTextToVideo:()=>Kn,imageToImage:()=>Hn,imageToText:()=>Un,imageToVideo:()=>Wn,makeRequestOptions:()=>E,makeRequestOptionsFromResolvedModel:()=>Cn,objectDetection:()=>qn,questionAnswering:()=>nr,request:()=>Mn,sentenceSimilarity:()=>rr,setLogger:()=>je,snippets:()=>Fl,streamingRequest:()=>Nn,summarization:()=>ir,tableQuestionAnswering:()=>ar,tabularClassification:()=>mr,tabularRegression:()=>hr,textClassification:()=>or,textGeneration:()=>sr,textGenerationStream:()=>cr,textToImage:()=>Jn,textToSpeech:()=>Rn,textToVideo:()=>Yn,tokenClassification:()=>lr,translation:()=>ur,visualQuestionAnswering:()=>pr,zeroShotClassification:()=>dr,zeroShotImageClassification:()=>Zn});export{Il as t};