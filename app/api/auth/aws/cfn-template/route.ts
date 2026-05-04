// Serves the CloudFormation template that the user launches in their
// AWS account. The template creates a single IAM role with our trust
// policy (gated by externalId) and attaches a managed policy.
//
// We default to AdministratorAccess so deploys don't fail on missing
// permissions during the demo. Users that care can override the
// ManagedPolicyArn parameter at stack-create time.

import { NextResponse } from "next/server";
import { getPlatformAccountId } from "@/lib/auth/aws-assume-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let trustedAccount: string;
  try {
    trustedAccount = await getPlatformAccountId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
  const yaml = renderTemplate(trustedAccount);
  return new Response(yaml, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function renderTemplate(trustedAccountId: string): string {
  return `AWSTemplateFormatVersion: '2010-09-09'
Description: |
  Sasa Launch deployment role. Allows the Sasa Launch platform
  (account ${trustedAccountId}) to deploy AWS resources into THIS
  account via STS:AssumeRole, gated by a per-installation External ID.

  No long-lived credentials are exchanged. Sasa Launch mints temporary
  STS credentials per deploy. Revoke at any time by deleting this stack.

Parameters:
  ExternalId:
    Type: String
    Description: |
      Per-installation random nonce supplied by Sasa Launch. Required for
      AssumeRole — guards against the confused deputy problem.
    AllowedPattern: '^[A-Za-z0-9]{16,256}$'
    NoEcho: true

  ManagedPolicyArn:
    Type: String
    Default: arn:aws:iam::aws:policy/AdministratorAccess
    Description: |
      The IAM-managed policy attached to the role. Default is
      AdministratorAccess so deployments don't fail on missing
      permissions; scope down to PowerUserAccess or a custom policy
      if you'd rather restrict what Sasa Launch can do.

  RoleName:
    Type: String
    Default: SasaLaunchDeployRole
    Description: Name for the IAM role. Change if you have a name conflict.

Resources:
  DeployRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Ref RoleName
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: arn:aws:iam::${trustedAccountId}:root
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: !Ref ExternalId
      ManagedPolicyArns:
        - !Ref ManagedPolicyArn
      Tags:
        - Key: ManagedBy
          Value: sasa-launch
        - Key: Purpose
          Value: deployment-role

Outputs:
  RoleArn:
    Description: Paste this back into Sasa Launch to finish the connection.
    Value: !GetAtt DeployRole.Arn
  ExternalId:
    Description: The external ID Sasa Launch will use when assuming this role. Keep it secret.
    Value: !Ref ExternalId
    NoEcho: true
  TrustedAccount:
    Description: The Sasa Launch platform account that can assume this role.
    Value: '${trustedAccountId}'
`;
}
