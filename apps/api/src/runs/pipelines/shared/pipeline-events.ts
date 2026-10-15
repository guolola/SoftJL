// Provides shared run stage progress values for pipeline event emission.
import { type RunStage } from "@uml-platform/contracts";

export function stageProgressValue(stage: RunStage) {
  switch (stage) {
    case "extract_rules":
      return 20;
    case "generate_models":
      return 65;
    case "generate_design_sequence":
      return 45;
    case "generate_design_models":
      return 70;
    case "generate_tests":
      return 75;
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    case "generate_document_text":
      return 55;
    case "render_document_file":
      return 90;
    case "generate_plantuml":
      return 80;
    case "render_svg":
      return 95;
    case "verify_diagram_visual":
      return 98;
    case "generate_context":
      return 35;
    case "generate_business_flow":
      return 65;
    case "render_business_flow":
      return 75;
    case "render_context":
      return 60;
    case "generate_implementation":
      return 85;
  }
}
