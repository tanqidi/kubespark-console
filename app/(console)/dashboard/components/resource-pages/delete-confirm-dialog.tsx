"use client"

import * as React from "react"
import { useTranslations } from "@/app/lib/i18n"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function DeleteConfirmDialog({
  open,
  title,
  description,
  deleting = false,
  actionLabel,
  pendingLabel,
  actionVariant = "destructive",
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: React.ReactNode
  description: React.ReactNode
  deleting?: boolean
  actionLabel?: React.ReactNode
  pendingLabel?: React.ReactNode
  actionVariant?: "default" | "destructive"
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const t = useTranslations()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={deleting}
          >
            {t("actions.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={actionVariant}
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault()
              onConfirm()
            }}
          >
            {deleting ? pendingLabel ?? t("deleteConfirmDialog.deleting") : actionLabel ?? t("actions.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
