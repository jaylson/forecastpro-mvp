import swaggerUi from 'swagger-ui-express'
import swaggerJSDoc from 'swagger-jsdoc'
import type { Express } from 'express'

export function mountSwagger(app: Express) {
  const options: swaggerJSDoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: { title: 'ForecastPro API', version: '0.1.0' },
      components: {
        schemas: {
          OrgCreate: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          DatasetCreate: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string', nullable: true } }, required: ['name'] },
          ForecastRequest: { type: 'object', properties: { horizon: { type: 'integer', minimum: 1, maximum: 24, default: 3 } } },
        },
      },
    },
    apis: [],
  }
  const spec = swaggerJSDoc(options)
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec))
}
