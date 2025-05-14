import * as vscode from 'vscode';
import { MemoryManager } from '../core/memory';
import { CodebaseIndexer } from '../core/indexer';

export class VSCodeIntegration {
  private context: vscode.ExtensionContext;
  private memoryManager: MemoryManager;
  private indexer: CodebaseIndexer;
  private outputChannel: vscode.OutputChannel;
  private statusBarItem: vscode.StatusBarItem;
  private isActive: boolean = false;

  constructor(
    context: vscode.ExtensionContext,
    memoryManager: MemoryManager,
    indexer: CodebaseIndexer
  ) {
    this.context = context;
    this.memoryManager = memoryManager;
    this.indexer = indexer;
    
    // Create output channel for logs
    this.outputChannel = vscode.window.createOutputChannel('KODER');
    
    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.text = '$(brain) KODER';
    this.statusBarItem.tooltip = 'KODER Pair Programming Assistant';
    this.statusBarItem.command = 'koder.ask';
    this.context.subscriptions.push(this.statusBarItem);
    
    // Setup file watchers and event handlers
    this.setupEventHandlers();
  }

  public start(): void {
    if (this.isActive) {
      return;
    }
    
    this.isActive = true;
    this.statusBarItem.show();
    this.log('KODER pair programming assistant started');
    
    // Check if workspace is already indexed
    this.checkWorkspaceIndex();
  }

  public stop(): void {
    this.isActive = false;
    this.statusBarItem.hide();
    this.log('KODER pair programming assistant stopped');
  }

  private setupEventHandlers(): void {
    // Listen for document changes
    vscode.workspace.onDidChangeTextDocument(event => {
      if (this.isActive) {
        // Handle document changes
        this.onDocumentChanged(event);
      }
    }, null, this.context.subscriptions);
    
    // Listen for document saves
    vscode.workspace.onDidSaveTextDocument(document => {
      if (this.isActive) {
        // Handle document saves
        this.onDocumentSaved(document);
      }
    }, null, this.context.subscriptions);
    
    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (this.isActive && editor) {
        // Handle editor focus changes
        this.onEditorFocusChanged(editor);
      }
    }, null, this.context.subscriptions);
  }

  private async checkWorkspaceIndex(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }
    
    // Check if workspace needs indexing
    // In a real implementation, check metadata to see if already indexed
    const shouldIndex = true; // This would be determined by checking if index exists
    
    if (shouldIndex) {
      const indexNow = await vscode.window.showInformationMessage(
        'KODER needs to index your workspace for best results. Index now?',
        'Yes', 'Later'
      );
      
      if (indexNow === 'Yes') {
        vscode.commands.executeCommand('koder.indexWorkspace');
      }
    }
  }

  private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
    // Handle document changes for real-time analysis
    // This would be implemented with debouncing to avoid excessive processing
  }

  private onDocumentSaved(document: vscode.TextDocument): void {
    // Update the index when a document is saved
    this.log(`Document saved: ${document.fileName}`);
  }

  private onEditorFocusChanged(editor: vscode.TextEditor): void {
    // Respond to editor focus changes
    this.log(`Editor focus changed: ${editor.document.fileName}`);
  }

  public async askQuestion(question: string): Promise<void> {
    this.log(`User question: ${question}`);
    
    // Get active document for context
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage('No active editor to provide context');
      return;
    }
    
    // Show progress
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'KODER is thinking...',
      cancellable: false
    }, async (progress) => {
      try {
        // Get current file content for context
        const filePath = activeEditor.document.fileName;
        const fileContent = activeEditor.document.getText();
        
        // Get selected code if any
        const selection = activeEditor.selection;
        const selectedCode = activeEditor.document.getText(selection);
        
        // Prepare context
        const contextFiles = [fileContent];
        
        // Search for relevant files based on question
        const searchResults = await this.memoryManager.search(question);
        
        // Add relevant files to context
        for (const result of searchResults) {
          const content = await this.memoryManager.getFile(result.path);
          if (content) {
            contextFiles.push(content);
          }
        }
        
        // Get AI response
        // This would be implemented by calling an AI service
        const answer = await this.simulateAIResponse(question, contextFiles);
        
        // Show answer
        this.showAnswer(question, answer);
      } catch (error) {
        console.error('Error processing question:', error);
        vscode.window.showErrorMessage(`Failed to process question: ${error}`);
      }
    });
  }

  private async simulateAIResponse(question: string, context: string[]): Promise<string> {
    // In a real implementation, this would call Azure OpenAI
    return 'This is a simulated AI response. In the actual implementation, this would use Azure OpenAI to analyze your code and provide a helpful answer based on the context of your workspace.';
  }

  private showAnswer(question: string, answer: string): void {
    // Create a webview panel to display the answer
    const panel = vscode.window.createWebviewPanel(
      'koderAnswer',
      'KODER Answer',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    
    panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KODER Answer</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', sans-serif; padding: 20px; }
          .question { font-weight: bold; margin-bottom: 10px; }
          .answer { white-space: pre-wrap; }
          pre { background-color: #f5f5f5; padding: 10px; border-radius: 3px; overflow: auto; }
        </style>
      </head>
      <body>
        <div class="question">${this.escapeHtml(question)}</div>
        <div class="answer">${this.formatAnswer(answer)}</div>
      </body>
      </html>
    `;
  }

  private formatAnswer(text: string): string {
    // Convert markdown-like code blocks to HTML
    return text.replace(/```([\\s\\S]*?)```/g, (match, code) => {
      return `<pre>${this.escapeHtml(code)}</pre>`;
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
  }
}