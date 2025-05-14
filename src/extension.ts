import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { CodebaseIndexer } from './core/indexer';
import { MemoryManager } from './core/memory';
import { AzureClient } from './services/azure';
import { VSCodeIntegration } from './vscode/integration';

// Load environment variables
dotenv.config();

export async function activate(context: vscode.ExtensionContext) {
  console.log('KODER is now active!');

  try {
    // Initialize services
    const azureClient = new AzureClient();
    const memoryManager = new MemoryManager(azureClient);
    const indexer = new CodebaseIndexer(memoryManager);
    const vscodeIntegration = new VSCodeIntegration(context, memoryManager, indexer);

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('koder.start', () => {
        vscode.window.showInformationMessage('KODER pair programming started');
        vscodeIntegration.start();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('koder.indexWorkspace', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage('No workspace folder is open');
          return;
        }

        vscode.window.showInformationMessage('Starting workspace indexing...');
        try {
          await indexer.indexWorkspace(workspaceFolders[0].uri.fsPath);
          vscode.window.showInformationMessage('Workspace indexed successfully');
        } catch (error) {
          vscode.window.showErrorMessage(`Indexing failed: ${error}`);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('koder.ask', async () => {
        const question = await vscode.window.showInputBox({
          prompt: 'What would you like to know about your code?',
          placeHolder: 'e.g., How does the authentication system work?'
        });

        if (question) {
          vscodeIntegration.askQuestion(question);
        }
      })
    );

    // Auto-start if configured
    const config = vscode.workspace.getConfiguration('koder');
    if (config.get('enableAutocomplete')) {
      vscodeIntegration.start();
    }

  } catch (error) {
    console.error('Failed to activate KODER:', error);
    vscode.window.showErrorMessage(`KODER activation failed: ${error}`);
  }
}

export function deactivate() {
  console.log('KODER is now deactivated');
}