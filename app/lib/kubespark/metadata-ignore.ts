export const AUTO_ANNOTATION_KEYS = new Set<string>([
  "description",
  "deployment.kubernetes.io/revision",
  "kubectl.kubernetes.io/last-applied-configuration",
  "pv.kubernetes.io/bind-completed",
  "pv.kubernetes.io/bound-by-controller",
  "volume.kubernetes.io/selected-node",
  "control-plane.alpha.kubernetes.io/leader",
])

export const AUTO_LABEL_KEYS = new Set<string>([
  "pod-template-hash",
  "controller-revision-hash",
  "statefulset.kubernetes.io/pod-name",
  "batch.kubernetes.io/controller-uid",
  "batch.kubernetes.io/job-name",
  "controller-uid",
  "job-name",
  "kubernetes.io/metadata.name"
])

export function isAutoMetadataAnnotationKey(key: string): boolean {
  return AUTO_ANNOTATION_KEYS.has(key.trim().toLowerCase())
}

export function isAutoMetadataLabelKey(key: string): boolean {
  return AUTO_LABEL_KEYS.has(key.trim().toLowerCase())
}

