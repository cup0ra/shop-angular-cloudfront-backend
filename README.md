# Product Service

AWS CDK project for the Product Service used by the storefront.

## Available endpoints

- `GET /products` returns the full mock products list for PLP.
- `GET /products/{id}` returns a single product by id for PDP.

## Swagger documentation

For a local rendered Swagger UI, run `npm run swagger:ui` and open `http://localhost:8081`.

## Useful commands

- `npm run build` compiles TypeScript.
- `npm run test` runs unit tests.
- `npm run swagger:ui` starts local Swagger UI.
- `npm run cdk:synth` synthesizes CloudFormation templates.
- `npm run cdk:deploy:dev` deploys the dev stack.
- `npm run cdk:deploy:prod` deploys the prod stack.
- `npm run cdk:deploy` deploys all stacks.
