#!/usr/bin/env node

/**
 * BMAD Diagram Converter MCP Server
 * 
 * Provides Mermaid → Draw.io XML conversion as MCP tools
 * Works with Claude Desktop, Cline, and other MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONVERSION RULES (embedded from agent)
// ============================================================================

const SHAPE_MAPPINGS = {
  flowchart: {
    '[]': 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    '()': 'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    '{}': 'rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;overflow=hidden;',
    '([])': 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    '(())': 'ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    '[[]]': 'shape=process;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    'start': 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;',
    'end': 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;',
  },
  edge: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=classic;strokeWidth=1;',
  erEntity: 'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  erAttribute: 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;',
};

const ER_CARDINALITY = {
  '||': { arrow: 'ERone', fill: 0 },
  '|o': { arrow: 'ERzeroToOne', fill: 0 },
  'o|': { arrow: 'ERzeroToOne', fill: 0 },
  '}|': { arrow: 'ERoneToMany', fill: 0 },
  '|{': { arrow: 'ERoneToMany', fill: 0 },
  '}o': { arrow: 'ERzeroToMany', fill: 0 },
  'o{': { arrow: 'ERzeroToMany', fill: 0 },
};

// Additional style mappings for new diagram types
const SEQUENCE_STYLES = {
  participant: 'rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;',
  actor: 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  lifeline: 'html=1;points=[];perimeter=orthogonalPerimeter;outlineConnect=0;targetShapes=umlLifeline;portConstraint=eastwest;newEdgeStyle={"curved":0,"rounded":0};dashed=1;dashPattern=8 8;strokeWidth=1;strokeColor=#666666;',
  message: 'html=1;verticalAlign=bottom;endArrow=block;curved=0;rounded=0;',
  messageAsync: 'html=1;verticalAlign=bottom;endArrow=open;curved=0;rounded=0;dashed=1;',
  messageDotted: 'html=1;verticalAlign=bottom;endArrow=open;curved=0;rounded=0;dashed=1;dashPattern=1 2;',
  activation: 'rounded=0;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;',
  note: 'shape=note;whiteSpace=wrap;html=1;backgroundOutline=1;darkOpacity=0.05;fillColor=#fff2cc;strokeColor=#d6b656;',
};

const CLASS_STYLES = {
  class: 'swimlane;fontStyle=1;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  interface: 'swimlane;fontStyle=3;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#d5e8d4;strokeColor=#82b366;',
  abstract: 'swimlane;fontStyle=2;align=center;verticalAlign=top;childLayout=stackLayout;horizontal=1;startSize=26;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#e1d5e7;strokeColor=#9673a6;',
  member: 'text;strokeColor=none;fillColor=none;align=left;verticalAlign=top;spacingLeft=4;spacingRight=4;overflow=hidden;rotatable=0;points=[[0,0.5],[1,0.5]];portConstraint=eastwest;',
  separator: 'line;strokeWidth=1;fillColor=none;align=left;verticalAlign=middle;spacingTop=-1;spacingLeft=3;spacingRight=3;rotatable=0;labelPosition=right;points=[];portConstraint=eastwest;strokeColor=#6c8ebf;',
};

const MINDMAP_STYLES = {
  root: 'ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=16;',
  level1: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=14;',
  level2: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;',
  level3: 'rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=11;',
  connector: 'edgeStyle=entityRelationEdgeStyle;curved=1;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeWidth=2;',
};

const GITGRAPH_STYLES = {
  commit: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#dae8fc;strokeColor=#6c8ebf;',
  branch: {
    main: '#6c8ebf',
    develop: '#82b366',
    feature: '#d6b656',
    hotfix: '#b85450',
    release: '#9673a6',
  },
  connector: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=none;strokeWidth=3;',
  label: 'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;rounded=0;fontSize=10;',
};

// ============================================================================
// MERMAID PARSERS
// ============================================================================

function parseFlowchart(mermaidCode) {
  const lines = mermaidCode.trim().split('\n');
  const nodes = new Map();
  const edges = [];
  let direction = 'TD';

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Parse direction
    const dirMatch = trimmed.match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)/i);
    if (dirMatch) {
      direction = dirMatch[1].toUpperCase();
      continue;
    }

    // Parse node definitions and edges
    // Pattern: A[Label] --> B[Label]
    const edgeMatch = trimmed.match(/^(\w+)(\[.*?\]|\(.*?\)|\{.*?\})?(\s*)(-->|---|-\.->|==>)(\|.*?\|)?(\s*)(\w+)(\[.*?\]|\(.*?\)|\{.*?\})?/);
    if (edgeMatch) {
      const [, srcId, srcShape, , arrow, label, , tgtId, tgtShape] = edgeMatch;
      
      // Add source node
      if (!nodes.has(srcId)) {
        const srcLabel = srcShape ? srcShape.slice(1, -1).replace(/[\[\](){}]/g, '') : srcId;
        nodes.set(srcId, { id: srcId, label: srcLabel, shape: detectShape(srcShape) });
      }
      
      // Add target node
      if (!nodes.has(tgtId)) {
        const tgtLabel = tgtShape ? tgtShape.slice(1, -1).replace(/[\[\](){}]/g, '') : tgtId;
        nodes.set(tgtId, { id: tgtId, label: tgtLabel, shape: detectShape(tgtShape) });
      }

      edges.push({
        source: srcId,
        target: tgtId,
        label: label ? label.slice(1, -1) : null,
      });
      continue;
    }

    // Parse standalone node definition
    const nodeMatch = trimmed.match(/^(\w+)(\[.*?\]|\(.*?\)|\{.*?\}|\(\[.*?\]\)|\(\(.*?\)\)|\[\[.*?\]\])/);
    if (nodeMatch) {
      const [, id, shape] = nodeMatch;
      const label = extractLabel(shape);
      nodes.set(id, { id, label, shape: detectShape(shape) });
    }
  }

  return { nodes: Array.from(nodes.values()), edges, direction };
}

function detectShape(shapeStr) {
  if (!shapeStr) return '[]';
  if (shapeStr.startsWith('([') && shapeStr.endsWith('])')) return '([])';
  if (shapeStr.startsWith('((') && shapeStr.endsWith('))')) return '(())';
  if (shapeStr.startsWith('[[') && shapeStr.endsWith(']]')) return '[[]]';
  if (shapeStr.startsWith('[') && shapeStr.endsWith(']')) return '[]';
  if (shapeStr.startsWith('(') && shapeStr.endsWith(')')) return '()';
  if (shapeStr.startsWith('{') && shapeStr.endsWith('}')) return '{}';
  return '[]';
}

function extractLabel(shapeStr) {
  if (!shapeStr) return '';
  return shapeStr.replace(/^\W+|\W+$/g, '').replace(/[\[\](){}]/g, '');
}

function parseERDiagram(mermaidCode) {
  const lines = mermaidCode.trim().split('\n');
  const entities = new Map();
  const relationships = [];

  let currentEntity = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === 'erDiagram' || trimmed === '') continue;

    // Parse relationship: ENTITY_A ||--o{ ENTITY_B : label
    const relMatch = trimmed.match(/^(\w+)\s+(\|\||o\||\|o|\}o|o\{|\}\||\|\{)\s*--\s*(\|\||o\||\|o|\}o|o\{|\}\||\|\{)\s+(\w+)\s*:\s*(.+)$/);
    if (relMatch) {
      const [, srcEntity, srcCard, tgtCard, tgtEntity, label] = relMatch;
      
      if (!entities.has(srcEntity)) {
        entities.set(srcEntity, { name: srcEntity, attributes: [] });
      }
      if (!entities.has(tgtEntity)) {
        entities.set(tgtEntity, { name: tgtEntity, attributes: [] });
      }

      relationships.push({
        source: srcEntity,
        target: tgtEntity,
        sourceCardinality: srcCard,
        targetCardinality: tgtCard,
        label: label.trim(),
      });
      continue;
    }

    // Parse entity block start
    const entityMatch = trimmed.match(/^(\w+)\s*\{$/);
    if (entityMatch) {
      currentEntity = entityMatch[1];
      if (!entities.has(currentEntity)) {
        entities.set(currentEntity, { name: currentEntity, attributes: [] });
      }
      continue;
    }

    // Parse entity block end
    if (trimmed === '}') {
      currentEntity = null;
      continue;
    }

    // Parse attribute inside entity block
    if (currentEntity) {
      const attrMatch = trimmed.match(/^(\w+)\s+(\w+)(?:\s+(PK|FK|UK))?/);
      if (attrMatch) {
        const [, type, name, constraint] = attrMatch;
        entities.get(currentEntity).attributes.push({ type, name, constraint });
      }
    }
  }

  return { entities: Array.from(entities.values()), relationships };
}

// ============================================================================
// SEQUENCE DIAGRAM PARSER
// ============================================================================

function parseSequenceDiagram(mermaidCode) {
  const lines = mermaidCode.trim().split('\n');
  const participants = new Map();
  const messages = [];
  const notes = [];
  const activations = [];
  let participantOrder = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === 'sequenceDiagram' || trimmed === '') continue;

    // Parse participant/actor declarations
    const participantMatch = trimmed.match(/^(participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/i);
    if (participantMatch) {
      const [, type, id, alias] = participantMatch;
      participants.set(id, { 
        id, 
        label: alias || id, 
        type: type.toLowerCase(),
        order: participantOrder++
      });
      continue;
    }

    // Parse messages: A->>B: Message or A-->>B: Message
    const messageMatch = trimmed.match(/^(\w+)\s*(->>|-->>|->|-->|-x|--x|-\)|\--\))\s*(\w+)\s*:\s*(.+)$/);
    if (messageMatch) {
      const [, from, arrow, to, text] = messageMatch;
      
      // Auto-add participants if not declared
      if (!participants.has(from)) {
        participants.set(from, { id: from, label: from, type: 'participant', order: participantOrder++ });
      }
      if (!participants.has(to)) {
        participants.set(to, { id: to, label: to, type: 'participant', order: participantOrder++ });
      }

      const messageType = arrow.includes('--') ? 'async' : 
                         arrow.includes('x') ? 'lost' :
                         arrow.includes(')') ? 'create' : 'sync';

      messages.push({ from, to, text, type: messageType, arrow });
      continue;
    }

    // Parse notes: Note right of A: Text or Note over A,B: Text
    const noteMatch = trimmed.match(/^Note\s+(right of|left of|over)\s+(\w+(?:,\s*\w+)?)\s*:\s*(.+)$/i);
    if (noteMatch) {
      const [, position, participants_str, text] = noteMatch;
      notes.push({ position, participants: participants_str.split(',').map(p => p.trim()), text });
      continue;
    }

    // Parse activations
    const activateMatch = trimmed.match(/^(activate|deactivate)\s+(\w+)$/i);
    if (activateMatch) {
      const [, action, participant] = activateMatch;
      activations.push({ action: action.toLowerCase(), participant });
    }
  }

  return { 
    participants: Array.from(participants.values()).sort((a, b) => a.order - b.order), 
    messages, 
    notes,
    activations
  };
}

// ============================================================================
// CLASS DIAGRAM PARSER
// ============================================================================

function parseClassDiagram(mermaidCode) {
  const lines = mermaidCode.trim().split('\n');
  const classes = new Map();
  const relationships = [];

  let currentClass = null;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === 'classDiagram' || trimmed === '') continue;

    // Parse class declaration with body: class ClassName {
    const classStartMatch = trimmed.match(/^class\s+(\w+)(?:\s*\{)?$/);
    if (classStartMatch) {
      const [, name] = classStartMatch;
      currentClass = name;
      if (!classes.has(name)) {
        classes.set(name, { name, attributes: [], methods: [], stereotype: null });
      }
      continue;
    }

    // Parse closing brace
    if (trimmed === '}') {
      currentClass = null;
      continue;
    }

    // Parse interface/abstract annotation
    const annotationMatch = trimmed.match(/^<<(\w+)>>\s*(\w+)$/);
    if (annotationMatch) {
      const [, stereotype, name] = annotationMatch;
      if (!classes.has(name)) {
        classes.set(name, { name, attributes: [], methods: [], stereotype: stereotype.toLowerCase() });
      } else {
        classes.get(name).stereotype = stereotype.toLowerCase();
      }
      continue;
    }

    // Parse members inside class block
    if (currentClass) {
      const methodMatch = trimmed.match(/^([+\-#~])?\s*(\w+)\s*\((.*)\)(?:\s*:\s*(\w+))?(?:\s*\*|\s*\$)?$/);
      if (methodMatch) {
        const [, visibility, name, params, returnType] = methodMatch;
        classes.get(currentClass).methods.push({
          visibility: visibility || '+',
          name,
          params,
          returnType: returnType || 'void'
        });
        continue;
      }

      const attrMatch = trimmed.match(/^([+\-#~])?\s*(\w+)\s*:\s*(\w+)$/);
      if (attrMatch) {
        const [, visibility, name, type] = attrMatch;
        classes.get(currentClass).attributes.push({
          visibility: visibility || '+',
          name,
          type
        });
        continue;
      }
    }

    // Parse relationships: ClassA <|-- ClassB or ClassA --> ClassB
    const relMatch = trimmed.match(/^(\w+)\s+(<\|--|<\|-|<--|\*--|o--|-->|--\*|--o|\.\.>|<\.\.|\.\.|--)\s+(\w+)(?:\s*:\s*(.+))?$/);
    if (relMatch) {
      const [, from, rel, to, label] = relMatch;
      
      // Ensure classes exist
      if (!classes.has(from)) {
        classes.set(from, { name: from, attributes: [], methods: [], stereotype: null });
      }
      if (!classes.has(to)) {
        classes.set(to, { name: to, attributes: [], methods: [], stereotype: null });
      }

      const relType = rel.includes('<|') ? 'inheritance' :
                     rel.includes('*') ? 'composition' :
                     rel.includes('o') ? 'aggregation' :
                     rel.includes('..') ? 'dependency' : 'association';

      relationships.push({ from, to, type: relType, label: label || null, arrow: rel });
    }
  }

  return { classes: Array.from(classes.values()), relationships };
}

// ============================================================================
// MINDMAP PARSER
// ============================================================================

function parseMindmap(mermaidCode) {
  const lines = mermaidCode.trim().split('\n');
  const nodes = [];
  let nodeId = 0;
  const stack = [{ id: 'root', level: -1, children: [] }];

  for (const line of lines) {
    if (line.trim() === 'mindmap' || line.trim() === '') continue;

    // Calculate indentation level
    const indent = line.search(/\S/);
    const level = Math.floor(indent / 2); // Assuming 2 spaces per level
    const text = line.trim();

    // Parse node shape and text
    let label = text;
    let shape = 'default';
    
    // Check for shapes: ((text)), (text), [text], {{text}}
    if (text.startsWith('((') && text.endsWith('))')) {
      label = text.slice(2, -2);
      shape = 'circle';
    } else if (text.startsWith('{{') && text.endsWith('}}')) {
      label = text.slice(2, -2);
      shape = 'hexagon';
    } else if (text.startsWith('(') && text.endsWith(')')) {
      label = text.slice(1, -1);
      shape = 'rounded';
    } else if (text.startsWith('[') && text.endsWith(']')) {
      label = text.slice(1, -1);
      shape = 'square';
    } else if (text.startsWith(')') && text.endsWith('(')) {
      label = text.slice(1, -1);
      shape = 'cloud';
    }

    const node = {
      id: `node${nodeId++}`,
      label,
      shape,
      level,
      children: []
    };

    // Find parent
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    parent.children.push(node);
    nodes.push({ ...node, parentId: parent.id === 'root' ? null : parent.id });
    
    stack.push(node);
  }

  return { nodes, root: stack[0].children[0] || null };
}

// ============================================================================
// GITGRAPH PARSER
// ============================================================================

function parseGitGraph(mermaidCode) {
  const lines = mermaidCode.trim().split('\n');
  const commits = [];
  const branches = new Map([['main', { name: 'main', commits: [] }]]);
  let currentBranch = 'main';
  let commitId = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === 'gitGraph' || trimmed.startsWith('gitGraph') || trimmed === '') continue;

    // Parse commit
    const commitMatch = trimmed.match(/^commit(?:\s+id:\s*"([^"]+)")?(?:\s+tag:\s*"([^"]+)")?(?:\s+type:\s*(\w+))?/i);
    if (commitMatch) {
      const [, id, tag, type] = commitMatch;
      const commit = {
        id: id || `c${commitId++}`,
        tag: tag || null,
        type: type || 'NORMAL',
        branch: currentBranch
      };
      commits.push(commit);
      branches.get(currentBranch).commits.push(commit.id);
      continue;
    }

    // Parse branch creation
    const branchMatch = trimmed.match(/^branch\s+(\w+)/i);
    if (branchMatch) {
      const [, name] = branchMatch;
      branches.set(name, { name, commits: [], parentBranch: currentBranch });
      currentBranch = name;
      continue;
    }

    // Parse checkout
    const checkoutMatch = trimmed.match(/^checkout\s+(\w+)/i);
    if (checkoutMatch) {
      currentBranch = checkoutMatch[1];
      continue;
    }

    // Parse merge
    const mergeMatch = trimmed.match(/^merge\s+(\w+)(?:\s+tag:\s*"([^"]+)")?/i);
    if (mergeMatch) {
      const [, sourceBranch, tag] = mergeMatch;
      const commit = {
        id: `merge_${commitId++}`,
        tag: tag || null,
        type: 'MERGE',
        branch: currentBranch,
        mergeFrom: sourceBranch
      };
      commits.push(commit);
      branches.get(currentBranch).commits.push(commit.id);
    }
  }

  return { commits, branches: Array.from(branches.values()) };
}

// ============================================================================
// DRAW.IO XML GENERATORS
// ============================================================================

function generateFlowchartXML(parsed) {
  const { nodes, edges, direction } = parsed;
  
  // Calculate layout
  const isVertical = direction === 'TD' || direction === 'TB' || direction === 'BT';
  const positions = calculateFlowchartLayout(nodes, edges, isVertical);
  
  let cellsXML = '';
  let cellId = 2;

  // Generate node cells
  for (const node of nodes) {
    const pos = positions.get(node.id);
    let style = SHAPE_MAPPINGS.flowchart[node.shape] || SHAPE_MAPPINGS.flowchart['[]'];
    
    // Check for start/end nodes
    const labelLower = node.label.toLowerCase();
    if (labelLower === 'start') {
      style = SHAPE_MAPPINGS.flowchart.start;
    } else if (labelLower === 'end' || labelLower === 'stop') {
      style = SHAPE_MAPPINGS.flowchart.end;
    }

    // Adjust diamond size for text
    let width = 120;
    let height = 60;
    if (node.shape === '{}') {
      const textLen = node.label.length;
      width = textLen <= 15 ? 120 : textLen <= 30 ? 160 : 200;
      height = textLen <= 15 ? 80 : textLen <= 30 ? 100 : 120;
    }

    cellsXML += `        <mxCell id="${node.id}" value="${escapeXML(node.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${width}" height="${height}" as="geometry"/>
        </mxCell>\n`;
  }

  // Generate edge cells
  for (const edge of edges) {
    const edgeId = `e${cellId++}`;
    const exitPoints = getExitPoints(edge.source, edge.target, positions, direction);
    let edgeStyle = SHAPE_MAPPINGS.edge + exitPoints;
    
    let labelAttr = edge.label ? ` value="${escapeXML(edge.label)}"` : '';
    
    cellsXML += `        <mxCell id="${edgeId}"${labelAttr} style="${edgeStyle}" edge="1" parent="1" source="${edge.source}" target="${edge.target}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
  }

  return wrapInDrawioXML('Flowchart', cellsXML);
}

function generateERDiagramXML(parsed) {
  const { entities, relationships } = parsed;
  
  // Grid layout
  const GRID_X = [40, 440, 840, 1240];
  const GRID_Y = [40, 390, 740, 1090];
  const ENTITY_WIDTH = 200;
  
  let cellsXML = '';
  let cellId = 2;
  const entityPositions = new Map();

  // Position entities on grid
  entities.forEach((entity, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = GRID_X[col] || GRID_X[0] + (col * 400);
    const y = GRID_Y[row] || GRID_Y[0] + (row * 350);
    const height = 30 + (entity.attributes.length * 22) || 100;
    
    entityPositions.set(entity.name, { x, y, width: ENTITY_WIDTH, height });

    // Entity container
    cellsXML += `        <mxCell id="${entity.name}" value="${escapeXML(entity.name)}" style="${SHAPE_MAPPINGS.erEntity}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${ENTITY_WIDTH}" height="${height}" as="geometry"/>
        </mxCell>\n`;

    // Attributes
    entity.attributes.forEach((attr, attrIndex) => {
      const attrId = `${entity.name}_attr${attrIndex}`;
      const attrY = 30 + (attrIndex * 22);
      let attrStyle = SHAPE_MAPPINGS.erAttribute;
      if (attr.constraint === 'PK') attrStyle += 'fontStyle=4;'; // underline
      if (attr.constraint === 'FK') attrStyle += 'fontStyle=2;'; // italic
      
      const attrLabel = `${attr.type} ${attr.name}${attr.constraint ? ' ' + attr.constraint : ''}`;
      
      cellsXML += `        <mxCell id="${attrId}" value="${escapeXML(attrLabel)}" style="${attrStyle}" vertex="1" parent="${entity.name}">
          <mxGeometry y="${attrY}" width="${ENTITY_WIDTH}" height="22" as="geometry"/>
        </mxCell>\n`;
    });
  });

  // Generate relationship edges
  for (const rel of relationships) {
    const edgeId = `rel${cellId++}`;
    const srcPos = entityPositions.get(rel.source);
    const tgtPos = entityPositions.get(rel.target);
    
    if (!srcPos || !tgtPos) continue;

    // Determine cardinality arrows
    const srcArrow = ER_CARDINALITY[rel.sourceCardinality] || { arrow: 'ERone', fill: 0 };
    const tgtArrow = ER_CARDINALITY[rel.targetCardinality] || { arrow: 'ERone', fill: 0 };
    
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;startArrow=${srcArrow.arrow};startFill=${srcArrow.fill};endArrow=${tgtArrow.arrow};endFill=${tgtArrow.fill};`;
    
    // Determine exit/entry points
    const exitEntry = calculateERExitEntry(srcPos, tgtPos);
    
    cellsXML += `        <mxCell id="${edgeId}" value="${escapeXML(rel.label)}" style="${style}${exitEntry}" edge="1" parent="1" source="${rel.source}" target="${rel.target}">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="0" y="-25" as="offset"/>
          </mxGeometry>
        </mxCell>\n`;
  }

  return wrapInDrawioXML('ER Diagram', cellsXML, 1600, 1200);
}

function calculateFlowchartLayout(nodes, edges, isVertical) {
  const positions = new Map();
  const xSpacing = 200;
  const ySpacing = 120;
  let x = 340;
  let y = 40;

  // Simple linear layout for now
  // TODO: Implement proper tree layout
  for (const node of nodes) {
    positions.set(node.id, { x, y });
    if (isVertical) {
      y += ySpacing;
    } else {
      x += xSpacing;
    }
  }

  return positions;
}

function calculateERExitEntry(srcPos, tgtPos) {
  // Determine best connection points based on relative positions
  let exitX, exitY, entryX, entryY;
  
  if (Math.abs(srcPos.y - tgtPos.y) < 50) {
    // Same row - horizontal connection
    if (srcPos.x < tgtPos.x) {
      exitX = 1; exitY = 0.5; entryX = 0; entryY = 0.5;
    } else {
      exitX = 0; exitY = 0.5; entryX = 1; entryY = 0.5;
    }
  } else if (Math.abs(srcPos.x - tgtPos.x) < 50) {
    // Same column - vertical connection
    if (srcPos.y < tgtPos.y) {
      exitX = 0.5; exitY = 1; entryX = 0.5; entryY = 0;
    } else {
      exitX = 0.5; exitY = 0; entryX = 0.5; entryY = 1;
    }
  } else {
    // Diagonal - prefer horizontal then vertical
    if (srcPos.x < tgtPos.x) {
      exitX = 1; exitY = 0.5;
    } else {
      exitX = 0; exitY = 0.5;
    }
    if (srcPos.y < tgtPos.y) {
      entryX = 0.5; entryY = 0;
    } else {
      entryX = 0.5; entryY = 1;
    }
  }

  return `exitX=${exitX};exitY=${exitY};entryX=${entryX};entryY=${entryY};`;
}

// ============================================================================
// SEQUENCE DIAGRAM XML GENERATOR
// ============================================================================

function generateSequenceDiagramXML(parsed) {
  const { participants, messages, notes } = parsed;
  
  let cellsXML = '';
  let cellId = 2;
  
  const PARTICIPANT_WIDTH = 100;
  const PARTICIPANT_HEIGHT = 50;
  const PARTICIPANT_SPACING = 180;
  const LIFELINE_START_Y = 80;
  const MESSAGE_SPACING = 60;
  const participantPositions = new Map();
  
  // Calculate positions for participants
  participants.forEach((p, index) => {
    const x = 80 + (index * PARTICIPANT_SPACING);
    participantPositions.set(p.id, { x, centerX: x + PARTICIPANT_WIDTH / 2 });
    
    // Participant box at top
    const style = p.type === 'actor' ? SEQUENCE_STYLES.actor : SEQUENCE_STYLES.participant;
    cellsXML += `        <mxCell id="${p.id}" value="${escapeXML(p.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="20" width="${PARTICIPANT_WIDTH}" height="${PARTICIPANT_HEIGHT}" as="geometry"/>
        </mxCell>\n`;
    
    // Lifeline
    const lifelineHeight = LIFELINE_START_Y + (messages.length * MESSAGE_SPACING) + 100;
    cellsXML += `        <mxCell id="${p.id}_lifeline" style="${SEQUENCE_STYLES.lifeline}" vertex="1" parent="1">
          <mxGeometry x="${x + PARTICIPANT_WIDTH / 2 - 1}" y="${LIFELINE_START_Y}" width="2" height="${lifelineHeight}" as="geometry"/>
        </mxCell>\n`;
  });
  
  // Generate messages
  messages.forEach((msg, index) => {
    const y = LIFELINE_START_Y + 30 + (index * MESSAGE_SPACING);
    const fromPos = participantPositions.get(msg.from);
    const toPos = participantPositions.get(msg.to);
    
    if (!fromPos || !toPos) return;
    
    const isAsync = msg.type === 'async';
    const style = isAsync ? SEQUENCE_STYLES.messageAsync : SEQUENCE_STYLES.message;
    const isReverse = fromPos.centerX > toPos.centerX;
    
    const startX = fromPos.centerX;
    const endX = toPos.centerX;
    
    cellsXML += `        <mxCell id="msg${cellId++}" value="${escapeXML(msg.text)}" style="${style}" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="${startX}" y="${y}" as="sourcePoint"/>
            <mxPoint x="${endX}" y="${y}" as="targetPoint"/>
          </mxGeometry>
        </mxCell>\n`;
  });
  
  // Generate notes
  notes.forEach((note, index) => {
    const y = LIFELINE_START_Y + 50 + (index * 30);
    const firstParticipant = note.participants[0];
    const pos = participantPositions.get(firstParticipant);
    
    if (!pos) return;
    
    const x = note.position.includes('right') ? pos.x + PARTICIPANT_WIDTH + 20 :
              note.position.includes('left') ? pos.x - 120 : pos.x;
    
    cellsXML += `        <mxCell id="note${cellId++}" value="${escapeXML(note.text)}" style="${SEQUENCE_STYLES.note}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="100" height="40" as="geometry"/>
        </mxCell>\n`;
  });
  
  const totalWidth = Math.max(800, participants.length * PARTICIPANT_SPACING + 100);
  const totalHeight = LIFELINE_START_Y + (messages.length * MESSAGE_SPACING) + 200;
  
  return wrapInDrawioXML('Sequence Diagram', cellsXML, totalWidth, totalHeight);
}

// ============================================================================
// CLASS DIAGRAM XML GENERATOR
// ============================================================================

function generateClassDiagramXML(parsed) {
  const { classes, relationships } = parsed;
  
  let cellsXML = '';
  let cellId = 2;
  
  const CLASS_WIDTH = 180;
  const CLASS_SPACING_X = 250;
  const CLASS_SPACING_Y = 200;
  const classPositions = new Map();
  
  // Position classes in a grid
  classes.forEach((cls, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 60 + (col * CLASS_SPACING_X);
    const y = 60 + (row * CLASS_SPACING_Y);
    
    // Calculate height based on members
    const headerHeight = 30;
    const memberHeight = 22;
    const totalHeight = headerHeight + 
                       (cls.attributes.length * memberHeight) + 
                       (cls.methods.length > 0 ? memberHeight : 0) + // Separator
                       (cls.methods.length * memberHeight) + 10;
    
    classPositions.set(cls.name, { x, y, width: CLASS_WIDTH, height: totalHeight });
    
    // Determine style based on stereotype
    let classStyle = CLASS_STYLES.class;
    if (cls.stereotype === 'interface') classStyle = CLASS_STYLES.interface;
    if (cls.stereotype === 'abstract') classStyle = CLASS_STYLES.abstract;
    
    const displayName = cls.stereotype ? `&lt;&lt;${cls.stereotype}&gt;&gt;\\n${cls.name}` : cls.name;
    
    // Class container
    cellsXML += `        <mxCell id="${cls.name}" value="${displayName}" style="${classStyle}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${CLASS_WIDTH}" height="${totalHeight}" as="geometry"/>
        </mxCell>\n`;
    
    let memberY = headerHeight;
    
    // Attributes
    cls.attributes.forEach((attr, attrIndex) => {
      const visibility = attr.visibility === '+' ? '+' : attr.visibility === '-' ? '-' : attr.visibility === '#' ? '#' : '~';
      const attrLabel = `${visibility} ${attr.name}: ${attr.type}`;
      
      cellsXML += `        <mxCell id="${cls.name}_attr${attrIndex}" value="${escapeXML(attrLabel)}" style="${CLASS_STYLES.member}" vertex="1" parent="${cls.name}">
          <mxGeometry y="${memberY}" width="${CLASS_WIDTH}" height="${memberHeight}" as="geometry"/>
        </mxCell>\n`;
      memberY += memberHeight;
    });
    
    // Separator before methods
    if (cls.methods.length > 0) {
      cellsXML += `        <mxCell id="${cls.name}_sep" style="${CLASS_STYLES.separator}" vertex="1" parent="${cls.name}">
          <mxGeometry y="${memberY}" width="${CLASS_WIDTH}" height="8" as="geometry"/>
        </mxCell>\n`;
      memberY += 8;
    }
    
    // Methods
    cls.methods.forEach((method, methodIndex) => {
      const visibility = method.visibility === '+' ? '+' : method.visibility === '-' ? '-' : method.visibility === '#' ? '#' : '~';
      const methodLabel = `${visibility} ${method.name}(${method.params}): ${method.returnType}`;
      
      cellsXML += `        <mxCell id="${cls.name}_method${methodIndex}" value="${escapeXML(methodLabel)}" style="${CLASS_STYLES.member}" vertex="1" parent="${cls.name}">
          <mxGeometry y="${memberY}" width="${CLASS_WIDTH}" height="${memberHeight}" as="geometry"/>
        </mxCell>\n`;
      memberY += memberHeight;
    });
  });
  
  // Generate relationship edges
  for (const rel of relationships) {
    const edgeId = `rel${cellId++}`;
    const srcPos = classPositions.get(rel.from);
    const tgtPos = classPositions.get(rel.to);
    
    if (!srcPos || !tgtPos) continue;
    
    // Determine arrow style based on relationship type
    let startArrow = 'none';
    let endArrow = 'none';
    let dashed = '';
    
    switch (rel.type) {
      case 'inheritance':
        endArrow = 'block';
        break;
      case 'composition':
        startArrow = 'diamondThin';
        endArrow = 'open';
        break;
      case 'aggregation':
        startArrow = 'diamond';
        endArrow = 'open';
        break;
      case 'dependency':
        endArrow = 'open';
        dashed = 'dashed=1;dashPattern=8 8;';
        break;
      default:
        endArrow = 'open';
    }
    
    const style = `edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;startArrow=${startArrow};startFill=0;endArrow=${endArrow};endFill=0;${dashed}`;
    const exitEntry = calculateERExitEntry(srcPos, tgtPos);
    
    cellsXML += `        <mxCell id="${edgeId}" value="${rel.label ? escapeXML(rel.label) : ''}" style="${style}${exitEntry}" edge="1" parent="1" source="${rel.from}" target="${rel.to}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
  }
  
  const totalWidth = Math.max(800, Math.ceil(classes.length / 3) * CLASS_SPACING_X + 150);
  const totalHeight = Math.max(600, Math.ceil(classes.length / 3) * CLASS_SPACING_Y + 150);
  
  return wrapInDrawioXML('Class Diagram', cellsXML, totalWidth, totalHeight);
}

// ============================================================================
// MINDMAP XML GENERATOR
// ============================================================================

function generateMindmapXML(parsed) {
  const { nodes, root } = parsed;
  
  if (!root) {
    return wrapInDrawioXML('Mindmap', '', 800, 600);
  }
  
  let cellsXML = '';
  let cellId = 2;
  
  // Canvas settings from agent rules
  const CANVAS_WIDTH = 2400;
  const CANVAS_HEIGHT = 1800;
  const CENTER_X = CANVAS_WIDTH / 2;
  const CENTER_Y = CANVAS_HEIGHT / 2;
  
  // Radii for different levels (from agent rules)
  const LEVEL_RADII = [0, 350, 280, 220, 180];
  const NODE_SIZES = {
    0: { width: 180, height: 90 },
    1: { width: 160, height: 70 },
    2: { width: 140, height: 55 },
    3: { width: 120, height: 45 },
  };
  
  const nodePositions = new Map();
  
  // Calculate positions using radial layout
  function calculateNodePositions(node, angle, parentX, parentY, level) {
    const radius = LEVEL_RADII[level] || 150;
    const size = NODE_SIZES[level] || NODE_SIZES[3];
    
    let x, y;
    if (level === 0) {
      x = CENTER_X - size.width / 2;
      y = CENTER_Y - size.height / 2;
    } else {
      x = parentX + Math.cos(angle) * radius - size.width / 2;
      y = parentY + Math.sin(angle) * radius - size.height / 2;
    }
    
    nodePositions.set(node.id, { x, y, centerX: x + size.width / 2, centerY: y + size.height / 2, width: size.width, height: size.height });
    
    // Position children
    if (node.children && node.children.length > 0) {
      const childCount = node.children.length;
      const fanAngle = Math.PI * (level === 0 ? 2 : 1.2);
      const startAngle = level === 0 ? 0 : angle - fanAngle / 2;
      const angleStep = fanAngle / Math.max(childCount - 1, 1);
      
      node.children.forEach((child, index) => {
        const childAngle = childCount === 1 ? angle : startAngle + (index * angleStep);
        calculateNodePositions(child, childAngle, x + size.width / 2, y + size.height / 2, level + 1);
      });
    }
  }
  
  // Build tree structure from flat nodes
  function buildTree(nodeList) {
    const nodeMap = new Map();
    nodeList.forEach(n => nodeMap.set(n.id, { ...n, children: [] }));
    
    let rootNode = null;
    nodeList.forEach(n => {
      const node = nodeMap.get(n.id);
      if (n.parentId) {
        const parent = nodeMap.get(n.parentId);
        if (parent) parent.children.push(node);
      } else {
        rootNode = node;
      }
    });
    
    return rootNode;
  }
  
  const treeRoot = buildTree(nodes);
  if (treeRoot) {
    calculateNodePositions(treeRoot, 0, CENTER_X, CENTER_Y, 0);
  }
  
  // Generate node cells
  nodes.forEach((node) => {
    const pos = nodePositions.get(node.id);
    if (!pos) return;
    
    const level = node.level;
    const style = level === 0 ? MINDMAP_STYLES.root :
                 level === 1 ? MINDMAP_STYLES.level1 :
                 level === 2 ? MINDMAP_STYLES.level2 : MINDMAP_STYLES.level3;
    
    cellsXML += `        <mxCell id="${node.id}" value="${escapeXML(node.label)}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${pos.x}" y="${pos.y}" width="${pos.width}" height="${pos.height}" as="geometry"/>
        </mxCell>\n`;
    
    // Connector to parent
    if (node.parentId) {
      const parentPos = nodePositions.get(node.parentId);
      if (parentPos) {
        cellsXML += `        <mxCell id="conn${cellId++}" style="${MINDMAP_STYLES.connector}" edge="1" parent="1" source="${node.parentId}" target="${node.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
      }
    }
  });
  
  return wrapInDrawioXML('Mindmap', cellsXML, CANVAS_WIDTH, CANVAS_HEIGHT);
}

// ============================================================================
// GITGRAPH XML GENERATOR
// ============================================================================

function generateGitGraphXML(parsed) {
  const { commits, branches } = parsed;
  
  let cellsXML = '';
  let cellId = 2;
  
  const COMMIT_SIZE = 30;
  const COMMIT_SPACING_Y = 60;
  const BRANCH_SPACING_X = 100;
  const START_X = 100;
  const START_Y = 50;
  
  // Assign X positions to branches
  const branchPositions = new Map();
  branches.forEach((branch, index) => {
    branchPositions.set(branch.name, START_X + (index * BRANCH_SPACING_X));
  });
  
  // Branch labels
  branches.forEach((branch) => {
    const x = branchPositions.get(branch.name);
    const color = GITGRAPH_STYLES.branch[branch.name] || GITGRAPH_STYLES.branch.feature;
    
    cellsXML += `        <mxCell id="branch_${branch.name}" value="${escapeXML(branch.name)}" style="${GITGRAPH_STYLES.label}fontStyle=1;fontColor=${color};" vertex="1" parent="1">
          <mxGeometry x="${x - 20}" y="10" width="80" height="20" as="geometry"/>
        </mxCell>\n`;
  });
  
  // Position commits
  const commitPositions = new Map();
  commits.forEach((commit, index) => {
    const x = branchPositions.get(commit.branch) || START_X;
    const y = START_Y + (index * COMMIT_SPACING_Y);
    commitPositions.set(commit.id, { x, y });
  });
  
  // Generate commits
  commits.forEach((commit, index) => {
    const pos = commitPositions.get(commit.id);
    const color = GITGRAPH_STYLES.branch[commit.branch] || GITGRAPH_STYLES.branch.feature;
    
    const fillColor = commit.type === 'MERGE' ? '#f8cecc' : 
                     commit.type === 'HIGHLIGHT' ? '#d5e8d4' : '#dae8fc';
    
    cellsXML += `        <mxCell id="${commit.id}" value="${commit.tag || ''}" style="${GITGRAPH_STYLES.commit}fillColor=${fillColor};strokeColor=${color};" vertex="1" parent="1">
          <mxGeometry x="${pos.x - COMMIT_SIZE/2}" y="${pos.y - COMMIT_SIZE/2}" width="${COMMIT_SIZE}" height="${COMMIT_SIZE}" as="geometry"/>
        </mxCell>\n`;
    
    // Connect to previous commit
    if (index > 0) {
      const prevCommit = commits[index - 1];
      const prevPos = commitPositions.get(prevCommit.id);
      
      if (prevCommit.branch === commit.branch || commit.type === 'MERGE') {
        const sourceId = commit.type === 'MERGE' && commit.mergeFrom ? 
          branches.find(b => b.name === commit.mergeFrom)?.commits.slice(-1)[0] || prevCommit.id :
          prevCommit.id;
        
        cellsXML += `        <mxCell id="conn${cellId++}" style="${GITGRAPH_STYLES.connector}strokeColor=${color};" edge="1" parent="1" source="${sourceId}" target="${commit.id}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>\n`;
      }
    }
    
    // Tag label
    if (commit.tag) {
      cellsXML += `        <mxCell id="tag_${commit.id}" value="${escapeXML(commit.tag)}" style="${GITGRAPH_STYLES.label}fillColor=#fff2cc;strokeColor=#d6b656;rounded=1;" vertex="1" parent="1">
          <mxGeometry x="${pos.x + COMMIT_SIZE}" y="${pos.y - 10}" width="60" height="20" as="geometry"/>
        </mxCell>\n`;
    }
  });
  
  const totalWidth = Math.max(600, branches.length * BRANCH_SPACING_X + 200);
  const totalHeight = Math.max(400, commits.length * COMMIT_SPACING_Y + 100);
  
  return wrapInDrawioXML('Git Graph', cellsXML, totalWidth, totalHeight);
}

function getExitPoints(sourceId, targetId, positions, direction) {
  const srcPos = positions.get(sourceId);
  const tgtPos = positions.get(targetId);
  
  if (!srcPos || !tgtPos) return '';

  if (direction === 'TD' || direction === 'TB') {
    return 'exitX=0.5;exitY=1;entryX=0.5;entryY=0;';
  } else if (direction === 'BT') {
    return 'exitX=0.5;exitY=0;entryX=0.5;entryY=1;';
  } else if (direction === 'LR') {
    return 'exitX=1;exitY=0.5;entryX=0;entryY=0.5;';
  } else if (direction === 'RL') {
    return 'exitX=0;exitY=0.5;entryX=1;entryY=0.5;';
  }
  
  return '';
}

function wrapInDrawioXML(name, cellsXML, width = 850, height = 1100) {
  const timestamp = new Date().toISOString();
  const diagramId = `diagram_${Date.now()}`;
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${timestamp}" agent="BMAD-MCP" version="21.0.0">
  <diagram name="${escapeXML(name)}" id="${diagramId}">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
${cellsXML}      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

function escapeXML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// MARKDOWN GENERATOR
// ============================================================================

function generateMarkdown(mermaidCode, diagramType) {
  let parsed;
  let markdown = '';
  
  if (diagramType === 'flowchart') {
    parsed = parseFlowchart(mermaidCode);
    markdown = `# Flowchart Documentation

## Overview
This document describes the flowchart diagram with ${parsed.nodes.length} nodes and ${parsed.edges.length} connections.
Direction: ${parsed.direction}

## Nodes

| ID | Label | Shape |
|----|-------|-------|
${parsed.nodes.map(n => `| ${n.id} | ${n.label} | ${n.shape} |`).join('\n')}

## Connections

| From | To | Label |
|------|----|-------|
${parsed.edges.map(e => `| ${e.source} | ${e.target} | ${e.label || '-'} |`).join('\n')}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
  } else if (diagramType === 'erDiagram') {
    parsed = parseERDiagram(mermaidCode);
    markdown = `# ER Diagram Documentation

## Overview
This document describes the Entity-Relationship diagram with ${parsed.entities.length} entities and ${parsed.relationships.length} relationships.

## Entities

${parsed.entities.map(e => `### ${e.name}
| Type | Attribute | Constraint |
|------|-----------|------------|
${e.attributes.map(a => `| ${a.type} | ${a.name} | ${a.constraint || '-'} |`).join('\n') || '| - | - | - |'}
`).join('\n')}

## Relationships

| Source | Target | Label | Cardinality |
|--------|--------|-------|-------------|
${parsed.relationships.map(r => `| ${r.source} | ${r.target} | ${r.label} | ${r.sourceCardinality} to ${r.targetCardinality} |`).join('\n')}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
  } else if (diagramType === 'sequence') {
    parsed = parseSequenceDiagram(mermaidCode);
    markdown = `# Sequence Diagram Documentation

## Overview
This document describes the sequence diagram with ${parsed.participants.length} participants and ${parsed.messages.length} messages.

## Participants

| ID | Label | Type |
|----|-------|------|
${parsed.participants.map(p => `| ${p.id} | ${p.label} | ${p.type} |`).join('\n')}

## Messages

| # | From | To | Message | Type |
|---|------|----|---------|------|
${parsed.messages.map((m, i) => `| ${i + 1} | ${m.from} | ${m.to} | ${m.text} | ${m.type} |`).join('\n')}

${parsed.notes.length > 0 ? `## Notes

| Position | Participants | Text |
|----------|--------------|------|
${parsed.notes.map(n => `| ${n.position} | ${n.participants.join(', ')} | ${n.text} |`).join('\n')}
` : ''}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
  } else if (diagramType === 'class') {
    parsed = parseClassDiagram(mermaidCode);
    markdown = `# Class Diagram Documentation

## Overview
This document describes the class diagram with ${parsed.classes.length} classes and ${parsed.relationships.length} relationships.

## Classes

${parsed.classes.map(c => `### ${c.name}${c.stereotype ? ` <<${c.stereotype}>>` : ''}

**Attributes:**
| Visibility | Name | Type |
|------------|------|------|
${c.attributes.length > 0 ? c.attributes.map(a => `| ${a.visibility} | ${a.name} | ${a.type} |`).join('\n') : '| - | - | - |'}

**Methods:**
| Visibility | Name | Parameters | Return |
|------------|------|------------|--------|
${c.methods.length > 0 ? c.methods.map(m => `| ${m.visibility} | ${m.name} | ${m.params || '-'} | ${m.returnType} |`).join('\n') : '| - | - | - | - |'}
`).join('\n')}

## Relationships

| From | To | Type | Label |
|------|----|------|-------|
${parsed.relationships.map(r => `| ${r.from} | ${r.to} | ${r.type} | ${r.label || '-'} |`).join('\n')}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
  } else if (diagramType === 'mindmap') {
    parsed = parseMindmap(mermaidCode);
    markdown = `# Mindmap Documentation

## Overview
This document describes the mindmap with ${parsed.nodes.length} nodes.

## Structure

${generateMindmapTree(parsed.nodes)}

## Nodes

| ID | Label | Level | Shape |
|----|-------|-------|-------|
${parsed.nodes.map(n => `| ${n.id} | ${n.label} | ${n.level} | ${n.shape} |`).join('\n')}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
  } else if (diagramType === 'gitgraph') {
    parsed = parseGitGraph(mermaidCode);
    markdown = `# Git Graph Documentation

## Overview
This document describes the git graph with ${parsed.commits.length} commits across ${parsed.branches.length} branches.

## Branches

| Name | Parent Branch | Commits |
|------|---------------|---------|
${parsed.branches.map(b => `| ${b.name} | ${b.parentBranch || '-'} | ${b.commits.length} |`).join('\n')}

## Commits

| ID | Branch | Type | Tag |
|----|--------|------|-----|
${parsed.commits.map(c => `| ${c.id} | ${c.branch} | ${c.type} | ${c.tag || '-'} |`).join('\n')}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
  }
  
  return markdown || `# Diagram Documentation

## Notice
Markdown generation is not yet fully supported for diagram type: ${diagramType}

## Original Mermaid Code

\`\`\`mermaid
${mermaidCode}
\`\`\`
`;
}

// Helper function to generate tree structure for mindmap
function generateMindmapTree(nodes) {
  const rootNodes = nodes.filter(n => n.parentId === null);
  
  function renderNode(node, indent = '') {
    let result = `${indent}- **${node.label}**\n`;
    const children = nodes.filter(n => n.parentId === node.id);
    for (const child of children) {
      result += renderNode(child, indent + '  ');
    }
    return result;
  }
  
  return rootNodes.map(n => renderNode(n)).join('\n');
}

// ============================================================================
// DIAGRAM TYPE DETECTION
// ============================================================================

function detectDiagramType(mermaidCode) {
  const firstLine = mermaidCode.trim().split('\n')[0].toLowerCase();
  
  // Check more specific types first (gitgraph before graph)
  if (firstLine.includes('gitgraph')) {
    return 'gitgraph';
  } else if (firstLine.includes('erdiagram')) {
    return 'erDiagram';
  } else if (firstLine.includes('sequencediagram')) {
    return 'sequence';
  } else if (firstLine.includes('classdiagram')) {
    return 'class';
  } else if (firstLine.includes('mindmap')) {
    return 'mindmap';
  } else if (firstLine.includes('flowchart') || firstLine.includes('graph')) {
    return 'flowchart';
  }
  
  return 'unknown';
}

// ============================================================================
// MCP SERVER SETUP
// ============================================================================

const server = new Server(
  {
    name: 'diagram-converter',
    version: '6.0.0-alpha.7',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'convert_mermaid_to_drawio',
        description: 'Convert a Mermaid diagram to Draw.io XML format. Supports flowcharts, ER diagrams, sequence diagrams, class diagrams, mindmaps, and git graphs.',
        inputSchema: {
          type: 'object',
          properties: {
            mermaidCode: {
              type: 'string',
              description: 'The Mermaid diagram code to convert',
            },
            diagramType: {
              type: 'string',
              enum: ['flowchart', 'erDiagram', 'sequence', 'class', 'mindmap', 'gitgraph', 'auto'],
              description: 'The type of diagram (auto-detected if not specified)',
              default: 'auto',
            },
          },
          required: ['mermaidCode'],
        },
      },
      {
        name: 'convert_mermaid_to_markdown',
        description: 'Convert a Mermaid diagram to structured Markdown documentation.',
        inputSchema: {
          type: 'object',
          properties: {
            mermaidCode: {
              type: 'string',
              description: 'The Mermaid diagram code to document',
            },
          },
          required: ['mermaidCode'],
        },
      },
      {
        name: 'validate_mermaid',
        description: 'Validate Mermaid diagram syntax and check conversion compatibility.',
        inputSchema: {
          type: 'object',
          properties: {
            mermaidCode: {
              type: 'string',
              description: 'The Mermaid diagram code to validate',
            },
          },
          required: ['mermaidCode'],
        },
      },
      {
        name: 'get_conversion_rules',
        description: 'Get the Mermaid to Draw.io conversion ruleset and best practices.',
        inputSchema: {
          type: 'object',
          properties: {
            diagramType: {
              type: 'string',
              enum: ['flowchart', 'erDiagram', 'sequence', 'class', 'mindmap', 'gitgraph', 'general'],
              description: 'Get rules for a specific diagram type',
              default: 'general',
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'convert_mermaid_to_drawio': {
      const mermaidCode = args.mermaidCode;
      let diagramType = args.diagramType || 'auto';
      
      if (diagramType === 'auto') {
        diagramType = detectDiagramType(mermaidCode);
      }

      let xml;
      try {
        switch (diagramType) {
          case 'flowchart': {
            const parsed = parseFlowchart(mermaidCode);
            xml = generateFlowchartXML(parsed);
            break;
          }
          case 'erDiagram': {
            const parsed = parseERDiagram(mermaidCode);
            xml = generateERDiagramXML(parsed);
            break;
          }
          case 'sequence': {
            const parsed = parseSequenceDiagram(mermaidCode);
            xml = generateSequenceDiagramXML(parsed);
            break;
          }
          case 'class': {
            const parsed = parseClassDiagram(mermaidCode);
            xml = generateClassDiagramXML(parsed);
            break;
          }
          case 'mindmap': {
            const parsed = parseMindmap(mermaidCode);
            xml = generateMindmapXML(parsed);
            break;
          }
          case 'gitgraph': {
            const parsed = parseGitGraph(mermaidCode);
            xml = generateGitGraphXML(parsed);
            break;
          }
          default:
            return {
              content: [
                {
                  type: 'text',
                  text: `Unsupported diagram type: ${diagramType}. Supported types: flowchart, erDiagram, sequence, class, mindmap, gitgraph`,
                },
              ],
            };
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error converting diagram: ${error.message}\n\nPlease check your Mermaid syntax and try again.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Draw.io XML for ${diagramType}:\n\n\`\`\`xml\n${xml}\n\`\`\`\n\n**To use:** Copy the XML and import it into draw.io via File → Import From → Text`,
          },
        ],
      };
    }

    case 'convert_mermaid_to_markdown': {
      const mermaidCode = args.mermaidCode;
      const diagramType = detectDiagramType(mermaidCode);
      const markdown = generateMarkdown(mermaidCode, diagramType);
      
      return {
        content: [
          {
            type: 'text',
            text: markdown,
          },
        ],
      };
    }

    case 'validate_mermaid': {
      const mermaidCode = args.mermaidCode;
      const diagramType = detectDiagramType(mermaidCode);
      const issues = [];
      const suggestions = [];

      // Basic validation
      if (diagramType === 'unknown') {
        issues.push('❌ Could not detect diagram type. Ensure first line contains diagram declaration (flowchart, erDiagram, etc.)');
      }

      if (diagramType === 'flowchart') {
        const parsed = parseFlowchart(mermaidCode);
        
        // Check for start/end nodes
        const hasStart = parsed.nodes.some(n => n.label.toLowerCase() === 'start');
        const hasEnd = parsed.nodes.some(n => ['end', 'stop'].includes(n.label.toLowerCase()));
        
        if (!hasStart) {
          suggestions.push('⚠️ Consider adding a Start node for better diagram clarity');
        }
        if (!hasEnd) {
          suggestions.push('⚠️ Consider adding an End/Stop node for better diagram clarity');
        }

        // Check node IDs
        for (const node of parsed.nodes) {
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(node.id)) {
            issues.push(`❌ Invalid node ID: "${node.id}" - use alphanumeric with underscores only`);
          }
        }
      }

      if (diagramType === 'erDiagram') {
        const parsed = parseERDiagram(mermaidCode);
        
        if (parsed.entities.length === 0) {
          issues.push('❌ No entities found in ER diagram');
        }
        
        // Check for orphan entities
        const connectedEntities = new Set();
        for (const rel of parsed.relationships) {
          connectedEntities.add(rel.source);
          connectedEntities.add(rel.target);
        }
        
        for (const entity of parsed.entities) {
          if (!connectedEntities.has(entity.name) && parsed.relationships.length > 0) {
            suggestions.push(`⚠️ Entity "${entity.name}" has no relationships`);
          }
        }
      }

      const status = issues.length === 0 ? '✅ Valid' : '❌ Issues found';
      
      return {
        content: [
          {
            type: 'text',
            text: `## Validation Result: ${status}

**Diagram Type:** ${diagramType}

${issues.length > 0 ? '### Issues\n' + issues.join('\n') : ''}

${suggestions.length > 0 ? '### Suggestions\n' + suggestions.join('\n') : ''}

${issues.length === 0 && suggestions.length === 0 ? '✅ Diagram looks good and is ready for conversion!' : ''}`,
          },
        ],
      };
    }

    case 'get_conversion_rules': {
      const type = args.diagramType || 'general';
      
      const rules = {
        general: `# Mermaid to Draw.io Conversion Rules

## Supported Diagram Types
- **flowchart** - Process flows, decision trees
- **erDiagram** - Entity-relationship diagrams
- **sequence** - Sequence diagrams (sequenceDiagram)
- **class** - Class diagrams (classDiagram)
- **mindmap** - Mind maps
- **gitgraph** - Git commit graphs

## General Rules
- Wrap Mermaid in fenced code blocks
- Node IDs must be alphanumeric with underscores only
- Avoid complex styling - keep it simple
- Always specify direction for flowcharts (TD, LR, RL, BT)

## Shape Mappings
- \`[]\` rectangle → Draw.io rectangle
- \`()\` rounded → Draw.io rounded rectangle
- \`{}\` diamond → Draw.io rhombus
- \`([])\` stadium → Draw.io stadium shape
- \`(())\` circle → Draw.io ellipse
- \`[[]]\` subroutine → Draw.io process shape

## Edge Routing
- Use orthogonal edge style for clean diagrams
- Specify explicit entry/exit points
- Edges should never cut through nodes`,

        flowchart: `# Flowchart Conversion Rules

## Required Elements
- Start node: Stadium shape with "Start" label (green)
- End node: Stadium shape with "End" or "Stop" label (red)
- All flowcharts MUST have Start and End nodes

## Layout
- TD/TB: Top-down flow, 120px vertical spacing
- LR: Left-right flow, 200px horizontal spacing
- Minimum 200px between parallel branches

## Diamonds (Decisions)
- Size based on text length:
  - Short (≤15 chars): 120×80
  - Medium (16-30 chars): 160×100
  - Long (>30 chars): 200×120
- Always use overflow=hidden`,

        erDiagram: `# ER Diagram Conversion Rules

## Entity Layout (STRICT GRID)
- Grid columns: x = 40, 440, 840, 1240 (400px spacing)
- Grid rows: y = 40, 390, 740, 1090 (350px spacing)
- Entity width: 200px consistent
- Entity height: 30px header + 22px per attribute

## Relationships
- Lines MUST NEVER pass through entities
- Use corridor routing for diagonal relationships
- Corridors: x = 240, 640, 1040 | y = 215, 565, 915
- Labels offset 25-30px from lines

## Cardinality Symbols
- ||: ERone (exactly one)
- |o: ERzeroToOne (zero or one)
- }|: ERoneToMany (one or many)
- }o: ERzeroToMany (zero or many)`,

        sequence: `# Sequence Diagram Conversion Rules

## Syntax
\`\`\`
sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello
    B-->>A: Hi back
    Note right of A: This is a note
\`\`\`

## Message Types
- \`->>\` Solid line with arrowhead (sync)
- \`-->>\` Dotted line with arrowhead (async)
- \`->>\` Solid line (request)
- \`-->\` Dotted line (response)
- \`-x\` Lost message
- \`-)\` Create message

## Layout
- Participants: 100px wide, 180px spacing
- Lifelines: Dashed vertical lines below participants
- Messages: 60px vertical spacing
- Notes: Placed right/left/over participants`,

        class: `# Class Diagram Conversion Rules

## Syntax
\`\`\`
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    Animal <|-- Dog
\`\`\`

## Visibility Modifiers
- \`+\` Public
- \`-\` Private
- \`#\` Protected
- \`~\` Package

## Relationships
- \`<|--\` Inheritance
- \`*--\` Composition
- \`o--\` Aggregation
- \`-->\` Association
- \`..\` Dependency

## Stereotypes
- \`<<interface>>\` Interface class
- \`<<abstract>>\` Abstract class

## Layout
- Classes: 180px wide, 250x200px grid spacing
- 3 columns default layout`,

        mindmap: `# Mindmap Conversion Rules

## Syntax
\`\`\`
mindmap
    Root
        Branch 1
            Sub 1.1
            Sub 1.2
        Branch 2
            Sub 2.1
\`\`\`

## Node Shapes
- Default: Plain text
- \`[text]\` Square
- \`(text)\` Rounded
- \`((text))\` Circle
- \`{{text}}\` Hexagon

## Layout (Radial)
- Canvas: 2400×1800 minimum
- Root: Center of canvas
- Level 1: 350px radius from root
- Level 2: 280px radius from parent
- Level 3+: 220px radius from parent

## Node Sizes
- Root: 180×90
- Level 1: 160×70
- Level 2: 140×55
- Level 3+: 120×45 minimum`,

        gitgraph: `# Git Graph Conversion Rules

## Syntax
\`\`\`
gitGraph
    commit
    commit id: "feat-1" tag: "v1.0"
    branch develop
    commit
    checkout main
    merge develop
\`\`\`

## Commands
- \`commit\` - Add a commit to current branch
- \`commit id: "id"\` - Commit with custom ID
- \`commit tag: "tag"\` - Commit with tag
- \`branch name\` - Create and checkout branch
- \`checkout name\` - Switch to branch
- \`merge name\` - Merge branch into current

## Commit Types
- \`NORMAL\` - Regular commit (blue)
- \`MERGE\` - Merge commit (red)
- \`HIGHLIGHT\` - Highlighted commit (green)

## Layout
- Branches: 100px horizontal spacing
- Commits: 30px circles, 60px vertical spacing
- Branch colors: main(blue), develop(green), feature(yellow), hotfix(red)`,
      };

      return {
        content: [
          {
            type: 'text',
            text: rules[type] || rules.general,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${name}`,
          },
        ],
      };
  }
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'diagram-converter-agent',
        description: 'Full Mira agent persona for interactive diagram conversion',
        arguments: [
          {
            name: 'userName',
            description: 'Your name for personalized greetings',
            required: false,
          },
        ],
      },
    ],
  };
});

// Get prompt content
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'diagram-converter-agent') {
    // Try to load the full agent file
    const agentPaths = [
      join(__dirname, '..', '..', '..', 'bmad', 'agents', 'diagram-converter', 'diagram-converter.md'),
      join(__dirname, 'diagram-converter.md'),
    ];

    let agentContent = null;
    for (const path of agentPaths) {
      if (existsSync(path)) {
        agentContent = readFileSync(path, 'utf-8');
        break;
      }
    }

    const userName = args?.userName || 'User';

    if (agentContent) {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please embody this agent persona:

${agentContent}

Config:
- user_name: ${userName}
- communication_language: English

Start by greeting me and showing the menu.`,
            },
          },
        ],
      };
    } else {
      // Fallback to embedded summary
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You are Mira, the Diagram Conversion Specialist 🔄

You help convert Mermaid diagrams to Draw.io XML format and Markdown documentation.

Available commands:
1. *to-drawio - Convert Mermaid flowchart to Draw.io XML
2. *er-to-drawio - Convert ER diagram to Draw.io XML  
3. *to-markdown - Convert to Markdown documentation
4. *validate - Validate Mermaid syntax
5. *rules - Show conversion rules
6. *help - Show this menu

Greet ${userName} and show the menu.`,
            },
          },
        ],
      };
    }
  }

  return {
    messages: [],
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BMAD Diagram Converter MCP Server running on stdio');
}

main().catch(console.error);
